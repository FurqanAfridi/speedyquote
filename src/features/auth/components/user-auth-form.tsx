import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { supabase } from '@/lib/supabase/client';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import * as z from 'zod';

const formSchema = z.object({
  email: z.string().min(1, { message: 'Email is required' }).email({
    message: 'Enter a valid email address'
  }),
  // Login only checks that a password was typed. Enforcing the strength rules
  // here would advertise the password policy to anyone at the sign-in screen.
  password: z.string().min(1, { message: 'Password is required' })
});

export default function UserAuthForm() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useAppForm({
    defaultValues: {
      email: '',
      password: ''
    },
    validators: {
      onSubmit: formSchema
    },
    onSubmit: async ({ value }) => {
      if (!supabase) {
        setSubmitError(
          'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env, then restart the dev server.'
        );
        return;
      }

      setSubmitError(null);
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: value.email,
        password: value.password
      });

      setLoading(false);

      if (error) {
        // Supabase returns the same generic message for an unknown email and a
        // wrong password, which is what we want to surface — telling the user
        // which half was wrong lets an attacker enumerate accounts.
        setSubmitError(
          error.message === 'Invalid login credentials'
            ? 'That email and password combination is not correct.'
            : error.message
        );
        return;
      }

      toast.success('Signed in successfully');
      await navigate({ to: '/dashboard/overview' });
    }
  });

  return (
    <form
      className='w-full space-y-4'
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField
          name='email'
          children={(field) => (
            <field.TextField
              label='Email'
              type='email'
              autoComplete='email'
              placeholder='you@example.com'
              disabled={loading}
              required
            />
          )}
        />
        <form.AppField
          name='password'
          children={(field) => (
            <field.TextField
              label='Password'
              type='password'
              autoComplete='current-password'
              placeholder='Enter your password'
              disabled={loading}
              required
            />
          )}
        />
      </FieldGroup>

      {submitError && (
        <p role='alert' className='text-destructive text-sm'>
          {submitError}
        </p>
      )}

      <Button disabled={loading} className='w-full' type='submit'>
        {loading ? 'Signing in…' : 'Sign In'}
      </Button>
    </form>
  );
}
