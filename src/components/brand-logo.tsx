import * as React from 'react';
import { cn } from '@/lib/utils';

export function BrandLogo({ className, title = 'Speedy Quote' }: { className?: string; title?: string }) {
  const uid = React.useId().replace(/:/g, '');
  const gradId = `sq-mark-${uid}`;

  return (
    <svg
      viewBox='0 0 40 40'
      role='img'
      aria-label={title}
      className={cn('size-8 shrink-0', className)}
    >
      <defs>
        <linearGradient id={gradId} x1='6' y1='4' x2='36' y2='38' gradientUnits='userSpaceOnUse'>
          <stop stopColor='#14b8a6' />
          <stop offset='1' stopColor='#0f766e' />
        </linearGradient>
      </defs>
      <rect width='40' height='40' rx='11' fill={`url(#${gradId})`} />
      <path
        d='M12 16.5c0-3.4 2.7-5.5 7.2-5.5 3.3 0 5.7 1.2 7.1 3.1l-2.6 1.7c-.9-1.2-2.3-1.9-4.4-1.9-2.3 0-3.6.9-3.6 2.3 0 1.3 1 2 3.8 2.5l1.8.4c4.2.8 6.3 2.6 6.3 5.6 0 3.6-2.9 5.9-7.6 5.9-3.7 0-6.5-1.4-8-3.5l2.7-1.8c1 1.5 2.7 2.4 5.2 2.4 2.5 0 3.9-1 3.9-2.5 0-1.3-1-2.1-3.9-2.6l-1.9-.4c-4-.8-6-2.6-6-5.7Z'
        fill='white'
      />
      <path d='M27.5 11.5h5.5M30.2 8.8v5.4' stroke='white' strokeWidth='1.8' strokeLinecap='round' />
    </svg>
  );
}
