import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = ['admin', 'master_agent', 'agent', 'loader', 'user'] as const;
type UserRole = (typeof ALLOWED_ROLES)[number];

const ALLOWED_STATUS = ['pending', 'active', 'banned'] as const;
type UserStatus = (typeof ALLOWED_STATUS)[number];

function getRequiredEnv(name: string | string[]): string {
  const names = Array.isArray(name) ? name : [name];
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(`Missing server env var: ${names.join(' or ')}`);
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
  if (!res.ok) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  return { token, user: await res.json() };
}

function isUserRole(v: unknown): v is UserRole {
  return typeof v === 'string' && (ALLOWED_ROLES as readonly string[]).includes(v);
}

function isUserStatus(v: unknown): v is UserStatus {
  return typeof v === 'string' && (ALLOWED_STATUS as readonly string[]).includes(v);
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const { user: requester } = await requireSupabaseUser(req);

    const SUPABASE_SERVICE_ROLE_KEY = getRequiredEnv([
      'SUPABASE_SERVICE_ROLE_KEY',
      // Backward-compatible: sometimes misconfigured as a Vite env var. Keep server-only usage.
      'VITE_SUPABASE_SERVICE_ROLE_KEY',
    ]);
    const { url } = getSupabaseConfig();
    const supabaseAdmin = createClient(url, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: requesterProfile, error: requesterProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', requester.id)
      .maybeSingle();
    if (requesterProfileError) throw requesterProfileError;
    if (!requesterProfile || requesterProfile.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userId = String(body?.userId || '').trim();
    const updatesRaw = (body?.updates || {}) as Record<string, unknown>;

    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }

    const { data: before, error: beforeError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const updates: Record<string, unknown> = {};

    if (typeof updatesRaw.username === 'string' && updatesRaw.username.trim().length >= 3) {
      updates.username = updatesRaw.username.trim();
    }

    if (updatesRaw.role !== undefined) {
      if (!isUserRole(updatesRaw.role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }
      updates.role = updatesRaw.role;
    }

    if (updatesRaw.status !== undefined) {
      if (!isUserStatus(updatesRaw.status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      updates.status = updatesRaw.status;
    }

    if (updatesRaw.balance !== undefined) {
      const n = coerceNumber(updatesRaw.balance);
      if (n === null || n < 0) {
        res.status(400).json({ error: 'Invalid balance' });
        return;
      }
      updates.balance = n;
    }

    for (const key of ['win_streak', 'lose_streak', 'tickets'] as const) {
      if (updatesRaw[key] === undefined) continue;
      const n = coerceNumber(updatesRaw[key]);
      if (n === null || n < 0) {
        res.status(400).json({ error: `Invalid ${key}` });
        return;
      }
      updates[key] = Math.trunc(n);
    }

    if (updatesRaw.banned !== undefined) {
      if (typeof updatesRaw.banned !== 'boolean') {
        res.status(400).json({ error: 'Invalid banned flag' });
        return;
      }
      updates.banned = updatesRaw.banned;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid updates provided' });
      return;
    }

    const { data: after, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('*')
      .maybeSingle();
    if (updateError) throw updateError;

    // Audit trail (best-effort)
    const { error: logError } = await supabaseAdmin.from('admin_logs').insert({
      admin_id: requester.id,
      action_type: 'UPDATE_USER',
      target_id: userId,
      target_name: (after as any)?.username || (before as any)?.username || null,
      details: { before, after, updates },
    });
    if (logError) console.warn('Failed to write admin log:', logError.message);

    res.status(200).json({ profile: after });
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    res.status(status).json({ error: err?.message || 'Server error' });
  }
}
