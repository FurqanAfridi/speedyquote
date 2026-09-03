import { createFileRoute } from '@tanstack/react-router';
import { ListUploadPage } from '@/features/list-management/components/list-upload-page';

export const Route = createFileRoute('/dashboard/list-management')({
  head: () => ({ meta: [{ title: 'List Management' }] }),
  component: ListUploadPage
});
