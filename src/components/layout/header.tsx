import React from 'react';
import { SidebarTrigger } from '../ui/sidebar';
import { Separator } from '../ui/separator';
import { Breadcrumbs } from '../breadcrumbs';
import SearchInput from '../search-input';
import { ThemeModeToggle } from '../themes/theme-mode-toggle';
import { NotificationCenter } from '@/features/notifications/components/notification-center';

export default function Header() {
  return (
    <header className='bg-background/60 sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-2 rounded-t-xl border-b px-3 backdrop-blur-md sm:px-4'>
      <div className='flex min-w-0 items-center gap-2'>
        <SidebarTrigger className='-ml-1' />
        <Separator orientation='vertical' className='mr-2 hidden h-4 sm:block' />
        <div className='min-w-0 truncate'>
          <Breadcrumbs />
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-1 sm:gap-2'>
        <div className='hidden md:flex'>
          <SearchInput />
        </div>
        <ThemeModeToggle />
        <div className='hidden sm:block'>
          <NotificationCenter />
        </div>
      </div>
    </header>
  );
}
