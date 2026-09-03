import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export type LookupApiKeyRow = {
  id: number;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function hashToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function keysError(message: string) {
  if (message.includes('lookup_api_keys') || message.includes('does not exist')) {
    return new Error('Run supabase/migrations/20260903250000_lookup_api_keys.sql in Supabase first');
  }
  return new Error(message);
}

export async function listLookupApiKeys(): Promise<LookupApiKeyRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lookup_api_keys')
    .select('id, name, token_prefix, created_at, last_used_at, revoked_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw keysError(error.message);
  return (data ?? []) as LookupApiKeyRow[];
}

export async function hasActiveLookupApiKeys(): Promise<boolean> {
  try {
    const keys = await listLookupApiKeys();
    return keys.length > 0;
  } catch {
    return false;
  }
}

export async function createLookupApiKey(name: string): Promise<LookupApiKeyRow & { token: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Give this API a name, e.g. Ringba live');
  const token = `sq_${randomBytes(24).toString('base64url')}`;
  const token_prefix = `${token.slice(0, 7)}…${token.slice(-4)}`;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lookup_api_keys')
    .insert({
      name: trimmed,
      token_hash: hashToken(token),
      token_prefix
    })
    .select('id, name, token_prefix, created_at, last_used_at, revoked_at')
    .single();
  if (error || !data) throw keysError(error?.message ?? 'Could not create API key');
  return { ...(data as LookupApiKeyRow), token };
}

export async function revokeLookupApiKey(id: number): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('lookup_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null);
  if (error) throw keysError(error.message);
}

export async function matchStoredLookupToken(token: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lookup_api_keys')
    .select('id')
    .eq('token_hash', hashToken(token))
    .is('revoked_at', null)
    .maybeSingle();
  if (error || !data) return false;
  await admin
    .from('lookup_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id);
  return true;
}
