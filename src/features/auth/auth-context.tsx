import type { Session, User } from '@supabase/supabase-js';
import * as React from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase/client';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the session has been read on the client. */
  isLoading: boolean;
  /** False when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset. */
  isConfigured: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = React.createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  // Starts true and is only ever cleared from an effect. The session lives in a
  // cookie the browser client reads via document.cookie, so during SSR there is
  // nothing to read and every render would otherwise look signed out.
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = React.useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const value = React.useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: isSupabaseConfigured,
      signOut
    }),
    [session, isLoading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
