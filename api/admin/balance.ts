import { createClient } from '@supabase/supabase-js';

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

function coerceAmount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
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
      .select('id, role, balance')
      .eq('id', requester.id)
      .maybeSingle();
    if (requesterProfileError) throw requesterProfileError;
    if (!requesterProfile || requesterProfile.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const action = String(body?.action || '');
    const userId = String(body?.userId || '').trim();
    const amount = coerceAmount(body?.amount);

    if (!userId) {
      res.status(400).json({ error: 'Missing userId' });
      return;
    }
    if (!amount) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }
    if (action !== 'add' && action !== 'transfer') {
      res.status(400).json({ error: 'Invalid action' });
      return;
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, balance')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!targetProfile) {
      res.status(404).json({ error: 'Target user not found' });
      return;
    }

    if (action === 'add') {
      const warnings: string[] = [];
      const newBalance = Number(targetProfile.balance || 0) + amount;
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId)
        .select('id, balance')
        .maybeSingle();
      if (updateError) throw updateError;

      const { error: txError } = await supabaseAdmin.from('transactions').insert({
        sender_id: requester.id,
        receiver_id: userId,
        amount,
        type: 'load',
      });
      if (txError) {
        warnings.push('Failed to write transaction record');
        console.warn('Failed to write transaction record:', txError.message);
      }

      const { error: logError } = await supabaseAdmin.from('admin_logs').insert({
        admin_id: requester.id,
        action_type: 'ADD_BALANCE',
        target_id: userId,
        target_name: targetProfile.username,
        details: {
          amount,
          previousBalance: targetProfile.balance,
          newBalance,
        },
      });
      if (logError) {
        warnings.push('Failed to write admin log');
        console.warn('Failed to write admin log:', logError.message);
      }

      res.status(200).json({ updatedProfiles: [updated], warnings: warnings.length > 0 ? warnings : undefined });
      return;
    }

    // transfer: deduct from requester, add to target
    const requesterBalance = Number(requesterProfile.balance || 0);
    if (requesterBalance < amount) {
      res.status(400).json({ error: 'Insufficient balance' });
      return;
    }

    const newRequesterBalance = requesterBalance - amount;
    const newTargetBalance = Number(targetProfile.balance || 0) + amount;

    const warnings: string[] = [];

    const { error: requesterUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ balance: newRequesterBalance })
      .eq('id', requester.id);
    if (requesterUpdateError) throw requesterUpdateError;

    const { data: updatedTarget, error: targetUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({ balance: newTargetBalance })
      .eq('id', userId)
      .select('id, balance')
      .maybeSingle();
    if (targetUpdateError) throw targetUpdateError;

    const { error: txError } = await supabaseAdmin.from('transactions').insert({
      sender_id: requester.id,
      receiver_id: userId,
      amount,
      type: 'transfer',
    });
    if (txError) {
      warnings.push('Failed to write transaction record');
      console.warn('Failed to write transaction record:', txError.message);
    }

    const { error: logError } = await supabaseAdmin.from('admin_logs').insert({
      admin_id: requester.id,
      action_type: 'TRANSFER_BALANCE',
      target_id: userId,
      target_name: targetProfile.username,
      details: {
        amount,
        senderId: requester.id,
        senderPreviousBalance: requesterBalance,
        senderNewBalance: newRequesterBalance,
        recipientPreviousBalance: targetProfile.balance,
        recipientNewBalance: newTargetBalance,
      },
    });
    if (logError) {
      warnings.push('Failed to write admin log');
      console.warn('Failed to write admin log:', logError.message);
    }

    res.status(200).json({
      updatedProfiles: [
        { id: requester.id, balance: newRequesterBalance },
        updatedTarget,
      ],
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    res.status(status).json({ error: err?.message || 'Server error' });
  }
}
