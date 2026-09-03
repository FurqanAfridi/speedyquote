import { createFileRoute } from '@tanstack/react-router';

import { siteConfig } from '@/config/site';
import { seo } from '@/lib/seo';

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: seo({
      title: 'About',
      description: `${siteConfig.name} — postcard attribution and performance analytics for final expense direct mail.`,
      path: '/about'
    })
  }),
  component: AboutPage
});

function AboutPage() {
  return (
    <div className='min-h-screen px-4 py-12 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-3xl'>
        <div className='mb-12 text-center'>
          <h1 className='text-foreground text-3xl font-bold tracking-tight sm:text-4xl'>
            {siteConfig.name}
          </h1>
          <p className='text-muted-foreground mt-4 text-lg'>
            Postcard attribution, PIN lookup, and mail performance analytics.
          </p>
        </div>
        <div className='space-y-8'>
          <section className='bg-card rounded-2xl border p-8 shadow-sm'>
            <h2 className='text-foreground mb-4 text-xl font-semibold'>What it does</h2>
            <p className='text-muted-foreground text-lg leading-relaxed'>
              Each mailed piece carries a unique PIN. When a recipient calls, the PIN ties the call
              back to the exact postcard, creative, and person — so buyers get true age, homeowner
              status, and geography instead of caller-ID guesses.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
