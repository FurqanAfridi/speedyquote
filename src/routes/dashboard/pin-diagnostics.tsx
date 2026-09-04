import * as React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LookupTester } from '@/features/list-management/components/lookup-tester';
import { getLookupLogsPage } from '@/features/list-management/api/server';

export const Route = createFileRoute('/dashboard/pin-diagnostics')({
  head: () => ({ meta: [{ title: 'Lookups · Speedy Quote' }] }),
  component: ApiHitsPage
});

function ApiHitsPage() {
  const [testOpen, setTestOpen] = React.useState(false);
  const query = useQuery({
    queryKey: ['lookup-logs'],
    queryFn: () => getLookupLogsPage(),
    staleTime: 60_000
  });

  const logs = query.data?.logs ?? [];
  const hits = logs.filter((l) => l.hit).length;

  return (
    <PageContainer
      pageTitle='Lookups'
      pageDescription='See recent caller matches, or try a PIN, ZIP, or phone number yourself.'
    >
      <div className='space-y-5'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end'>
          <Button
            type='button'
            size='lg'
            variant={testOpen ? 'secondary' : 'default'}
            onClick={() => setTestOpen((v) => !v)}
          >
            {testOpen ? 'Hide test' : 'Try a lookup'}
          </Button>
        </div>

        {testOpen && (
          <Card>
            <CardHeader>
              <CardTitle>Try a lookup</CardTitle>
              <CardDescription className='text-base'>
                Enter a PIN, ZIP, or phone number to see if it finds someone on your list. This is the
                same check used when a call comes in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LookupTester />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent lookups</CardTitle>
            <CardDescription className='text-base'>
              {logs.length} shown
              {logs.length > 0 ? ` · ${hits} found a match` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {query.isLoading ? (
              <p className='text-muted-foreground text-base'>Loading…</p>
            ) : logs.length === 0 ? (
              <p className='text-muted-foreground text-base'>
                No lookups yet. Tap “Try a lookup” above to test one.
              </p>
            ) : (
              <>
                <div className='space-y-3 md:hidden'>
                  {logs.map((l) => (
                    <div key={l.request_id} className='space-y-2 rounded-lg border p-4 text-base'>
                      <div className='flex items-center justify-between gap-2'>
                        <span className='font-mono break-all'>{l.pin ?? '—'}</span>
                        <Badge variant={l.hit ? 'default' : 'outline'}>
                          {l.hit ? 'Found' : 'Not found'}
                        </Badge>
                      </div>
                      <p className='text-muted-foreground text-sm'>
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
                  <table className='w-full min-w-[32rem] text-left text-base'>
                    <thead>
                      <tr className='border-b'>
                        <th className='py-3 pr-4 font-medium'>When</th>
                        <th className='py-3 pr-4 font-medium'>Query</th>
                        <th className='py-3 pr-4 font-medium'>Type</th>
                        <th className='py-3 pr-4 font-medium'>Result</th>
                        <th className='py-3 pr-4 font-medium'>Speed</th>
                        <th className='py-3 font-medium'>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((l) => (
                        <tr key={l.request_id} className='border-b border-border/60'>
                          <td className='py-3 pr-4 whitespace-nowrap'>
                            {new Date(l.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className='py-3 pr-4 font-mono whitespace-nowrap'>{l.pin ?? '—'}</td>
                          <td className='py-3 pr-4 whitespace-nowrap'>{l.call_id ?? '—'}</td>
                          <td className='py-3 pr-4'>
                            <Badge variant={l.hit ? 'default' : 'outline'}>
                              {l.hit ? 'Found' : 'Not found'}
                            </Badge>
                          </td>
                          <td className='py-3 pr-4'>
                            {l.latency_ms != null ? `${l.latency_ms} ms` : '—'}
                          </td>
                          <td className='py-3'>{l.error ?? '—'}</td>
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
