import React from 'react';
import { Heading } from '../ui/heading';
import type { InfobarContent } from '@/components/ui/infobar';
import { BrandLogo } from '@/components/brand-logo';

function PageSkeleton() {
  return (
    <div className='flex flex-1 animate-pulse flex-col gap-4 p-4 md:px-6'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='bg-muted mb-2 h-8 w-48 rounded' />
          <div className='bg-muted h-4 w-96 rounded' />
        </div>
      </div>
      <div className='bg-muted mt-6 h-40 w-full rounded-lg' />
      <div className='bg-muted h-40 w-full rounded-lg' />
    </div>
  );
}

export default function PageContainer({
  children,
  isLoading = false,
  access = true,
  accessFallback,
  pageTitle,
  pageDescription,
  infoContent,
  pageHeaderAction
}: {
  children: React.ReactNode;
  isLoading?: boolean;
  access?: boolean;
  accessFallback?: React.ReactNode;
  pageTitle?: string;
  pageDescription?: string;
  infoContent?: InfobarContent;
  pageHeaderAction?: React.ReactNode;
}) {
  if (!access) {
    return (
      <div className='flex flex-1 items-center justify-center p-4 md:px-6'>
        {accessFallback ?? (
          <div className='text-muted-foreground text-center text-lg'>
            You do not have access to this page.
          </div>
        )}
      </div>
    );
  }

  const content = isLoading ? <PageSkeleton /> : children;
  const hasHeader = pageTitle || pageHeaderAction;

  return (
    <div className='relative flex min-w-0 flex-1 flex-col overflow-x-hidden'>
      <div className='pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-teal-500/12 via-background to-transparent dark:from-teal-400/10' />
      <div className='relative flex min-w-0 flex-1 flex-col p-4 md:px-6 md:pt-6'>
        {hasHeader && (
          <div className='mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='flex min-w-0 items-start gap-3'>
              <div className='mt-0.5 hidden sm:block'>
                <BrandLogo className='size-10 shadow-md shadow-teal-900/15' />
              </div>
              <Heading
                title={pageTitle ?? ''}
                description={pageDescription ?? ''}
                infoContent={infoContent}
              />
            </div>
            {pageHeaderAction && <div className='shrink-0'>{pageHeaderAction}</div>}
          </div>
        )}
        <div className='[&_[data-slot=card]]:border-border/80 [&_[data-slot=card]]:shadow-sm [&_[data-slot=card]]:transition-shadow hover:[&_[data-slot=card]]:shadow-md'>
          {content}
        </div>
      </div>
    </div>
  );
}
