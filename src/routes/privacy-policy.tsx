import { createFileRoute } from '@tanstack/react-router';

import { siteConfig } from '@/config/site';
import { seo } from '@/lib/seo';

export const Route = createFileRoute('/privacy-policy')({
  head: () => ({
    meta: seo({
      title: 'Privacy Policy',
      description: `Privacy policy for ${siteConfig.name}.`,
      path: '/privacy-policy'
    })
  }),
  component: PrivacyPolicyPage
});

function PrivacyPolicyPage() {
  return (
    <div className='min-h-screen px-4 py-12 sm:px-6 lg:px-8'>
      <div className='mx-auto max-w-3xl space-y-8'>
        <h1 className='text-foreground text-3xl font-bold'>Privacy Policy</h1>
        <section>
          <h2 className='text-foreground mb-3 text-xl font-semibold'>Introduction</h2>
          <p className='text-muted-foreground text-base leading-relaxed'>
            This Privacy Policy explains how {siteConfig.name} handles personal information. We are
            committed to protecting privacy and being transparent about data practices.
          </p>
        </section>
        <section>
          <h2 className='text-foreground mb-3 text-xl font-semibold'>Data Collection</h2>
          <p className='text-muted-foreground text-base leading-relaxed'>
            We collect account credentials for sign-in, plus mailing-list and call data you upload
            or sync for attribution. That data is used only to operate the dashboard and PIN lookup
            service.
          </p>
        </section>
        <section>
          <h2 className='text-foreground mb-3 text-xl font-semibold'>No Data Misuse</h2>
          <p className='text-muted-foreground text-base leading-relaxed'>
            Personal data is never sold, rented, or shared with third parties for marketing. It is
            used exclusively for the intended functionality of this application.
          </p>
        </section>
        <section>
          <h2 className='text-foreground mb-3 text-xl font-semibold'>Contact</h2>
          <p className='text-muted-foreground text-base leading-relaxed'>
            Questions about this policy can be directed to your account administrator.
          </p>
        </section>
        <div className='border-border border-t pt-4'>
          <p className='text-muted-foreground text-sm'>Last updated: September 2026</p>
        </div>
      </div>
    </div>
  );
}
