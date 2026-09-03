import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/dashboard/settings')({
  head: () => ({ meta: [{ title: 'Settings · Speedy Quote' }] }),
  component: () => <Outlet />
});
