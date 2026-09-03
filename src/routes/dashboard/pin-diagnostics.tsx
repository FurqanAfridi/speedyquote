import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LookupTester } from '@/features/list-management/components/lookup-tester';
import { getListUploadOptions } from '@/features/list-management/api/server';

export const Route = createFileRoute('/dashboard/pin-diagnostics')({
  head: () => ({ meta: [{ title: 'API · Speedy Quote' }] }),
  component: ApiHitsPage
});

function ApiHitsPage() {
  const [testOpen, setTestOpen] = React.useState(false);
  const query = useQuery({
    queryKey: ['list-upload-options'],
    queryFn: () => getListUploadOptions()
  });

  const logs = query.data?.logs ?? [];
  const hits = logs.filter((l) => l.hit).length;

  return (
    <PageContainer
      pageTitle='API'
      pageDescription='Review lookup hits. Open test lookup to try a PIN, ZIP, or caller ID.'
    >
      <div className='space-y-4'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end'>
          <Button type='button' variant={testOpen ? 'secondary' : 'default'} onClick={() => setTestOpen((v) => !v)}>
            {testOpen ? 'Close test lookup' : 'Test lookup'}
          </Button>
        </div>

        {testOpen && (
          <Card>
            <CardHeader>
              <CardTitle>Test lookup</CardTitle>
              <CardDescription>Same payload Ringba sends to POST /api/pin-lookup.</CardDescription>
            </CardHeader>
            <CardContent>
              <LookupTester />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent lookups</CardTitle>
            <CardDescription>
              {logs.length} shown
              {logs.length > 0 ? ` · ${hits} hits` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <p className='text-muted-foreground text-sm'>Loading…</p>
            ) : logs.length === 0 ? (
              <p className='text-muted-foreground text-sm'>No hits yet. Use Test lookup above.</p>
            ) : (
              <>
                <div className='space-y-3 md:hidden'>
                  {logs.map((l) => (
                    <div key={l.request_id} className='space-y-1 rounded-md border p-3 text-sm'>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='font-mono break-all'>{l.pin ?? '—'}</span>
                        <Badge variant={l.hit ? 'default' : 'outline'}>{l.hit ? 'hit' : 'miss'}</Badge>
                      </div>
                      <p className='text-muted-foreground'>
                        {new Date(l.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                        {l.call_id ? ` · ${l.call_id}` : ''}
                        {l.latency_ms != null ? ` · ${l.latency_ms} ms` : ''}
                      </p>
                      {l.error ? <p className='text-destructive'>{l.error}</p> : null}
                    </div>
                  ))}
                </div>
                <div className='hidden overflow-x-auto md:block'>
                  <table className='w-full min-w-[32rem] text-left text-sm'>
                    <thead>
                      <tr className='border-b'>
                        <th className='py-2 pr-4 font-medium'>When</th>
                        <th className='py-2 pr-4 font-medium'>Query</th>
                        <th className='py-2 pr-4 font-medium'>Type</th>
                        <th className='py-2 pr-4 font-medium'>Hit</th>
                        <th className='py-2 pr-4 font-medium'>ms</th>
                        <th className='py-2 font-medium'>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.request_id} className='border-b border-border/60'>
                          <td className='py-2 pr-4 whitespace-nowrap'>
                            {new Date(l.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className='py-2 pr-4 font-mono whitespace-nowrap'>{l.pin ?? '—'}</td>
                          <td className='py-2 pr-4 whitespace-nowrap'>{l.call_id ?? '—'}</td>
                          <td className='py-2 pr-4'>
                            <Badge variant={l.hit ? 'default' : 'outline'}>{l.hit ? 'hit' : 'miss'}</Badge>
                          </td>
                          <td className='py-2 pr-4'>{l.latency_ms ?? '—'}</td>
                          <td className='py-2'>{l.error ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
