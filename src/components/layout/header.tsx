import React from 'react';
import { SidebarTrigger } from '../ui/sidebar';
import { Separator } from '../ui/separator';
import { Breadcrumbs } from '../breadcrumbs';
import { ThemeModeToggle } from '../themes/theme-mode-toggle';
import { BrandLogo } from '@/components/brand-logo';
import { siteConfig } from '@/config/site';
import { Link } from '@tanstack/react-router';

export default function Header() {
  return (
    <header className='bg-background/70 sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 rounded-t-xl border-b px-3 backdrop-blur-md sm:px-4'>
      <div className='flex min-w-0 items-center gap-2'>
        <SidebarTrigger className='-ml-1 size-10' />
        <Separator orientation='vertical' className='hidden h-5 sm:block' />
        <Link
          to='/dashboard/overview'
          className='hidden min-w-0 items-center gap-2.5 sm:flex'
          aria-label={siteConfig.name}
        >
          <BrandLogo className='size-8' />
          <span className='truncate text-base font-semibold tracking-tight'>{siteConfig.shortName}</span>
        </Link>
        <Separator orientation='vertical' className='hidden h-4 md:block' />
        <div className='min-w-0 truncate'>
          <Breadcrumbs />
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-1 sm:gap-2'>
        <ThemeModeToggle />
      </div>
    </header>
  );
}
