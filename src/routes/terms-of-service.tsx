import { createFileRoute } from '@tanstack/react-router';

import { siteConfig } from '@/config/site';
import { seo } from '@/lib/seo';

export const Route = createFileRoute('/terms-of-service')({
  head: () => ({
    meta: seo({
      title: 'Terms of Service',
      description: `Terms of service for ${siteConfig.name}.`,
      path: '/terms-of-service'
    })
  }),
  component: TermsOfServicePage
});

function TermsOfServicePage() {
  return (
    <div className='min-h-screen px-4 py-12 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-3xl space-y-8'>
        <div className='text-center'>
          <h1 className='text-foreground text-3xl font-bold'>Terms of Service</h1>
          <p className='text-muted-foreground mt-2 text-sm'>
            Last updated:{' '}
            {new Date().toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        </div>
        <section>
          <h2 className='text-foreground mb-3 text-xl font-semibold'>Introduction</h2>
          <p className='text-muted-foreground text-base leading-relaxed'>
            These Terms of Service govern access to {siteConfig.name}. By using the application, you
            agree to these terms.
          </p>
        </section>
        <section>
          <h2 className='text-foreground mb-3 text-xl font-semibold'>Acceptable use</h2>
          <p className='text-muted-foreground text-base leading-relaxed'>
            You may use the dashboard to manage mailing lists, PIN attribution, and call
            performance for your own campaigns. Do not attempt to access other accounts or abuse the
            lookup API.
          </p>
        </section>
        <section>
          <h2 className='text-foreground mb-3 text-xl font-semibold'>Data</h2>
          <p className='text-muted-foreground text-base leading-relaxed'>
            You are responsible for the accuracy and lawful use of lists and call data you upload or
            sync into the platform.
          </p>
        </section>
      </div>
    </div>
  );
}
