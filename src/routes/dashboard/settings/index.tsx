import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/features/settings/settings-page';

export const Route = createFileRoute('/dashboard/settings/')({
  head: () => ({ meta: [{ title: 'Settings · Speedy Quote' }] }),
  component: SettingsPage
});
