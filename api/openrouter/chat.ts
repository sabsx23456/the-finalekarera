const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function getOpenRouterApiKey(): string {
  // Backward-compatible: some projects mistakenly set this as a Vite (public) env var.
  // We do NOT use `import.meta.env` anywhere for secrets; this is server-only.
  const v = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY;
  if (!v) {
    throw new Error('Missing server env var: OPENROUTER_API_KEY (or legacy VITE_OPENROUTER_API_KEY)');
  }
  return v;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Missing Supabase env vars (SUPABASE_URL/SUPABASE_ANON_KEY).');
  return { url, anonKey };
}

async function requireSupabaseUser(req: any) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing Authorization header'), { statusCode: 401 });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) throw Object.assign(new Error('Missing token'), { statusCode: 401 });

  const { url, anonKey } = getSupabaseConfig();
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }

  return { token, user: await res.json() };
}

function extractOpenRouterContent(raw: any): string {
  const content = raw?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && typeof p.text === 'string') return p.text;
        return '';
      })
      .join('');
  }
  return '';
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    await requireSupabaseUser(req);

    const OPENROUTER_API_KEY = getOpenRouterApiKey();

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const model = String(body?.model || '');
    const messages = body?.messages as OpenRouterMessage[] | undefined;
    const modalities = Array.isArray(body?.modalities) ? body.modalities.map(String) : undefined;

    if (!model) {
      res.status(400).json({ error: 'Missing model' });
      return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Missing messages' });
      return;
    }
    if (messages.length > 40) {
      res.status(413).json({ error: 'Too many messages' });
      return;
    }
    const totalChars = messages.reduce((sum, m) => sum + String(m?.content || '').length, 0);
    if (totalChars > 120_000) {
      res.status(413).json({ error: 'Message payload too large' });
      return;
    }

    const isAudio = modalities?.includes('audio') ?? false;
    const referer = req.headers?.origin || req.headers?.referer || 'https://example.invalid';

    // Notes: Audio models often require streaming.
    const upstream = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': String(referer),
        'X-Title': 'Sabong192 Support Chat',
      },
      body: JSON.stringify({
        model,
        messages,
        modalities,
        audio: isAudio ? { format: 'pcm16', voice: 'alloy' } : undefined,
        temperature: 0.2,
        max_tokens: 700,
        stream: isAudio,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      res.status(upstream.status || 500).json({ error: text || 'OpenRouter error' });
      return;
    }

    // Non-audio: use non-streaming responses (less overhead and simpler parsing).
    if (!isAudio) {
      const raw = await upstream.json().catch(() => null);
      const content = extractOpenRouterContent(raw).trim();
      if (!content) {
        res.status(502).json({ error: 'No response content received from OpenRouter.' });
        return;
      }
      res.status(200).json({ content });
      return;
    }

    if (!upstream.body) {
      res.status(502).json({ error: 'No response body received from OpenRouter stream.' });
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    let content = '';
    let audioData = '';
    let audioId = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines, keep remainder in buffer.
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        if (line === 'data: [DONE]') continue;

        const jsonText = line.replace(/^data:\s*/, '');
        try {
          const json = JSON.parse(jsonText);
          const delta = json?.choices?.[0]?.delta;
          if (delta?.content) content += String(delta.content);
          if (delta?.audio?.transcript) content += String(delta.audio.transcript);
          if (delta?.audio?.data) audioData += String(delta.audio.data);
          if (delta?.audio?.id) audioId = String(delta.audio.id);
        } catch {
          // Ignore partial JSON chunks.
        }
      }
    }

    if (!content && !audioData) {
      res.status(502).json({ error: 'No response content received from OpenRouter stream.' });
      return;
    }

    res.status(200).json({
      content: content.trim(),
      audio: audioData ? { id: audioId || 'audio_response', data: audioData } : undefined,
    });
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    res.status(status).json({ error: err?.message || 'Server error' });
  }
}
