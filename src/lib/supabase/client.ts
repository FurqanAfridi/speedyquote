import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Browser Supabase client, or null until the project credentials are set.
 *
 * `createBrowserClient` from @supabase/ssr persists the session in cookies
 * rather than localStorage, so the session is readable during server-side
 * rendering. That is what makes server-side route protection possible later
 * without migrating how sessions are stored.
 *
 * This is null rather than a throw so the app still boots with an empty .env —
 * throwing here runs at module load and takes down every route, including the
 * sign-in page that would tell you what went wrong.
 */
export const supabase = isSupabaseConfigured
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null;
