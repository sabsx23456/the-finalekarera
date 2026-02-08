const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

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
    const prompt = String(body?.prompt || '');
    const imageDataUrl = String(body?.imageDataUrl || '');
    const model = String(body?.model || '');
    const maxTokens = Number(body?.maxTokens ?? 900);

    if (!prompt) {
      res.status(400).json({ error: 'Missing prompt' });
      return;
    }
    if (prompt.length > 20_000) {
      res.status(413).json({ error: 'Prompt too large' });
      return;
    }
    if (!imageDataUrl.startsWith('data:image/')) {
      res.status(400).json({ error: 'Missing/invalid imageDataUrl' });
      return;
    }
    if (imageDataUrl.length > 10_000_000) {
      res.status(413).json({ error: 'Image payload too large' });
      return;
    }
    if (!model) {
      res.status(400).json({ error: 'Missing model' });
      return;
    }

    const referer = req.headers?.origin || req.headers?.referer || 'https://example.invalid';

    const upstream = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': String(referer),
        'X-Title': 'Sabong192 Karera Vision',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: Number.isFinite(maxTokens) ? maxTokens : 900,
        stream: false,
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      res.status(upstream.status || 500).json({ error: text || 'OpenRouter error' });
      return;
    }

    const raw = await upstream.json().catch(() => null);
    const content = extractOpenRouterContent(raw);
    res.status(200).json({ content, raw });
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    res.status(status).json({ error: err?.message || 'Server error' });
  }
}
