import type { QueryClient } from '@tanstack/react-query';
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/features/auth/auth-context';
import ThemeProvider from '@/components/themes/theme-provider';
import { seo } from '@/lib/seo';

import appCss from '@/styles/globals.css?url';

const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b'
};

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'theme-color', content: META_THEME_COLORS.light },
      ...seo()
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      { rel: 'apple-touch-icon', href: '/favicon.svg' }
    ]
  }),
  component: RootDocument
});

function RootDocument() {
  // The palette is fixed to the single remaining theme. Light/dark is handled
  // separately by ThemeProvider, which toggles the `dark` class that
  // themes/whatsapp.css keys its dark variables off.
  return (
    <html lang='en' suppressHydrationWarning data-theme='whatsapp'>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '${META_THEME_COLORS.dark}')
                }
              } catch (_) {}
            `
          }}
        />
      </head>
      <body className='bg-background overflow-x-hidden overscroll-none font-sans antialiased'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
          enableColorScheme
        >
          <AuthProvider>
            <Toaster />
            <Outlet />
          </AuthProvider>
        </ThemeProvider>
        <TanStackRouterDevtools position='bottom-left' />
        <Scripts />
      </body>
    </html>
  );
}
