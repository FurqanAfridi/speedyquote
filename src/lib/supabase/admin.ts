import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertServiceRoleConfigured } from '@/lib/env.server';

/**
 * Service-role client. Bypasses RLS — use only inside server routes / server
 * functions for PIN lookup, list upload, and other write paths.
 */
export function createAdminClient(): SupabaseClient {
  const { url, serviceRoleKey } = assertServiceRoleConfigured();
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
