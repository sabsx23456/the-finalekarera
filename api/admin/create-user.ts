import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = ['admin', 'master_agent', 'agent', 'loader', 'user'] as const;
type UserRole = (typeof ALLOWED_ROLES)[number];

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

function canCreateRole(creatorRole: UserRole, requestedRole: UserRole): boolean {
  if (creatorRole === 'admin') return true;
  if (creatorRole === 'master_agent') return requestedRole === 'agent' || requestedRole === 'user';
  if (creatorRole === 'agent') return requestedRole === 'user';
  if (creatorRole === 'loader') return requestedRole === 'user';
  return false;
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
    if (!requesterProfile || !isUserRole(requesterProfile.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');
    const username = String(body?.username || '').trim();
    const role = body?.role;

    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Invalid email' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }
    if (!username || username.length < 3) {
      res.status(400).json({ error: 'Username must be at least 3 characters' });
      return;
    }
    if (!isUserRole(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    if (!canCreateRole(requesterProfile.role, role)) {
      res.status(403).json({ error: 'Not allowed to create this role' });
      return;
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
      },
    });
    if (createError) throw createError;
    if (!created?.user?.id) {
      res.status(500).json({ error: 'Failed to create user' });
      return;
    }

    const status = requesterProfile.role === 'admin' ? 'active' : 'pending';

    // Ensure the profile is set consistently, regardless of whether a "handle_new_user" trigger exists.
    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: created.user.id,
      username,
      role,
      status,
      created_by: requester.id,
    });
    if (profileError) throw profileError;

    const { error: logError } = await supabaseAdmin.from('admin_logs').insert({
      admin_id: requester.id,
      action_type: 'CREATE_USER',
      target_id: created.user.id,
      target_name: username,
      details: { email, role, status, created_by: requester.id },
    });
    if (logError) {
      // Don't fail user creation if audit logging is misconfigured.
      console.warn('Failed to write admin log:', logError.message);
    }

    res.status(200).json({
      id: created.user.id,
      email: created.user.email,
      username,
      role,
      status,
      created_by: requester.id,
    });
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    res.status(status).json({ error: err?.message || 'Server error' });
  }
}
