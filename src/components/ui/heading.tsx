import { InfoButton } from '@/components/ui/info-button';
import type { InfobarContent } from '@/components/ui/infobar';

interface HeadingProps {
  title: string;
  description: string;
  infoContent?: InfobarContent;
}

export function Heading({ title, description, infoContent }: HeadingProps) {
  return (
    <div className='min-w-0'>
      <div className='flex items-center gap-2'>
        <h1 className='bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-2xl font-bold tracking-tight sm:text-3xl'>
          {title}
        </h1>
        {infoContent && (
          <div className='pt-1'>
            <InfoButton content={infoContent} />
          </div>
        )}
      </div>
      {description ? (
        <p className='text-muted-foreground mt-1 text-sm'>{description}</p>
      ) : null}
    </div>
  );
}
