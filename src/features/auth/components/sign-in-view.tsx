import { cn } from '@/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { siteConfig } from '@/config/site';
import { useAuth } from '../auth-context';
import UserAuthForm from './user-auth-form';
import { InteractiveGridPattern } from './interactive-grid';
import { BrandLogo } from '@/components/brand-logo';

export default function SignInViewPage() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  // Someone who still has a valid session has no reason to see this page.
  React.useEffect(() => {
    if (!isLoading && user) {
      navigate({ to: '/dashboard/overview', replace: true });
    }
  }, [isLoading, user, navigate]);

  return (
    <div className='relative flex min-h-screen flex-col items-center justify-center overflow-hidden md:grid lg:max-w-none lg:grid-cols-2 lg:px-0'>
      <div className='relative hidden h-full flex-col p-10 lg:flex dark:border-r'>
        <div className='absolute inset-0 bg-sidebar' />
        <div className='text-sidebar-foreground relative z-20 flex items-center gap-2 text-lg font-medium'>
          <BrandLogo className='size-8' />
          {siteConfig.name}
        </div>
        <InteractiveGridPattern
          className={cn(
            'mask-[radial-gradient(400px_circle_at_center,white,transparent)]',
            'inset-x-0 inset-y-[0%] h-full skew-y-12'
          )}
        />
        <div className='text-sidebar-foreground relative z-20 mt-auto'>
          <blockquote className='space-y-2'>
            <p className='text-lg'>
              Attribute every postcard call with a unique PIN — true age, homeowner status, and
              creative performance for final expense mail.
            </p>
          </blockquote>
        </div>
      </div>
      <div className='flex h-full items-center justify-center p-4 lg:p-8'>
        <div className='mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]'>
          <div className='flex flex-col space-y-2 text-center'>
            <h1 className='text-2xl font-semibold tracking-tight'>Sign in</h1>
            <p className='text-muted-foreground text-sm'>
              Enter your email and password to access {siteConfig.shortName}
            </p>
          </div>
          <UserAuthForm />
          <p className='text-muted-foreground px-8 text-center text-sm'>
            By continuing, you agree to our{' '}
            <Link
              to='/terms-of-service'
              className='hover:text-primary underline underline-offset-4'
            >
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to='/privacy-policy' className='hover:text-primary underline underline-offset-4'>
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
