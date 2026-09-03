/**
 * Server-only env. Never import this from client components — these keys must
 * not ship in the browser bundle.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function getSupabaseUrl(): string | undefined {
  return read('SUPABASE_URL') ?? read('VITE_SUPABASE_URL');
}

export function getSupabaseAnonKey(): string | undefined {
  return read('SUPABASE_ANON_KEY') ?? read('VITE_SUPABASE_ANON_KEY');
}

export function getSupabaseServiceRoleKey(): string | undefined {
  return read('SUPABASE_SERVICE_ROLE_KEY');
}

export function getRingbaLookupToken(): string | undefined {
  return read('RINGBA_LOOKUP_TOKEN');
}

export function assertServiceRoleConfigured(): {
  url: string;
  serviceRoleKey: string;
} {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL / VITE_SUPABASE_URL). Add them to .env.'
    );
  }
  return { url, serviceRoleKey };
}
