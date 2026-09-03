import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useAuth } from '@/features/auth/auth-context';
import CommandMenu from '@/components/command-menu';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { InfoSidebar } from '@/components/layout/info-sidebar';
import { InfobarProvider } from '@/components/ui/infobar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [
      { title: 'Speedy Quote Dashboard' },
      {
        name: 'description',
        content: 'Postcard attribution and performance analytics'
      },
      { name: 'robots', content: 'noindex, nofollow' }
    ]
  }),
  component: DashboardLayout
});

function DashboardLayout() {
  const { user, isLoading, isConfigured } = useAuth();
  const navigate = useNavigate();

  // With no Supabase credentials there is no way to sign in, so enforcing the
  // guard would lock the dashboard behind a login that cannot succeed. Allow it
  // through in dev only — a production build always enforces the guard, so an
  // unconfigured deploy fails closed rather than serving an open dashboard.
  const bypassGuard = !isConfigured && import.meta.env.DEV;

  React.useEffect(() => {
    if (bypassGuard) return;
    if (!isLoading && !user) {
      navigate({ to: '/auth/sign-in', replace: true });
    }
  }, [bypassGuard, isLoading, user, navigate]);

  // Render nothing but the spinner until the session is known, otherwise a
  // signed-out visitor sees the dashboard chrome for a frame before the
  // redirect lands.
  if (!bypassGuard && (isLoading || !user)) {
    return (
      <div className='flex min-h-dvh items-center justify-center'>
        <div className='border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent' />
      </div>
    );
  }

  return (
    <CommandMenu>
      <SidebarProvider>
        <a
          href='#main-content'
          className='sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring'
        >
          Skip to content
        </a>
        <AppSidebar />
        <SidebarInset id='main-content' tabIndex={-1} className='min-w-0 overflow-x-hidden'>
          {bypassGuard && (
            <div className='bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm'>
              Authentication is disabled — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
              to enable it.
            </div>
          )}
          <Header />
          <InfobarProvider defaultOpen={false}>
            <Outlet />
            <InfoSidebar side='right' />
          </InfobarProvider>
        </SidebarInset>
      </SidebarProvider>
    </CommandMenu>
  );
}
