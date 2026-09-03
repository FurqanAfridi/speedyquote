import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { fetchOverview, fetchPortalSettings } from '@/features/list-management/api/server';

export const Route = createFileRoute('/dashboard/overview')({
  head: () => ({ meta: [{ title: 'Overview · Speedy Quote' }] }),
  component: OverviewPage
});

function OverviewPage() {
  const query = useQuery({
    queryKey: ['overview'],
    queryFn: () => fetchOverview()
  });
  const settingsQuery = useQuery({
    queryKey: ['portal-settings'],
    queryFn: () => fetchPortalSettings()
  });

  const d = query.data;
  const hitRate =
    d && d.lookupCount > 0 ? `${((d.hitCount / d.lookupCount) * 100).toFixed(0)}%` : '—';
  const hitRate24h =
    d && d.lookupsLast24h > 0 ? `${((d.hitsLast24h / d.lookupsLast24h) * 100).toFixed(0)}%` : '—';
  const pinCoverage =
    d && d.recordCount > 0 ? `${((d.pinCount / d.recordCount) * 100).toFixed(0)}%` : '—';

  return (
    <PageContainer
      pageTitle={settingsQuery.data?.org_name ? `${settingsQuery.data.org_name} overview` : 'Overview'}
      pageDescription='List coverage, lookup quality, and how records break down by vertical and state.'
    >
      {query.isLoading && <p className='text-muted-foreground text-sm'>Loading…</p>}
      {query.error && <p className='text-destructive text-sm'>{query.error.message}</p>}
      {d && (
        <div className='space-y-6'>
          <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
            <Kpi label='Records' value={String(d.recordCount)} hint={`${d.recordsLast7Days} added in 7 days`} />
            <Kpi label='PINs' value={String(d.pinCount)} hint={`${pinCoverage} of records have a PIN`} />
            <Kpi label='API hits' value={String(d.lookupCount)} hint={`${d.lookupsLast24h} in last 24h`} />
            <Kpi label='Hit rate' value={hitRate} hint={`${hitRate24h} last 24h`} />
          </div>

          <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
            <Kpi label='Unique states' value={String(d.uniqueStates)} />
            <Kpi label='Verticals in data' value={String(d.uniqueVerticals)} />
            <Kpi label='Avg lookup' value={d.avgLatencyMs != null ? `${d.avgLatencyMs} ms` : '—'} />
            <Kpi label='Hits (24h)' value={String(d.hitsLast24h)} />
          </div>

          <div className='grid gap-6 lg:grid-cols-2'>
            <BreakdownCard title='By vertical' rows={d.byVertical} />
            <BreakdownCard title='By state' rows={d.byState} />
            <BreakdownCard title='By list source' rows={d.byListSource} />
            <BreakdownCard title='Lookups by type' rows={d.byLookupMethod} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent lookups</CardTitle>
              <CardDescription>Latest rows from lookup_logs</CardDescription>
            </CardHeader>
            <CardContent>
              {d.recentLogs.length === 0 ? (
                <p className='text-muted-foreground text-sm'>No API hits yet. Test a lookup on the API page.</p>
              ) : (
                <div className='-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0'>
                  <table className='w-full min-w-[28rem] text-left text-sm'>
                    <thead>
                      <tr className='border-b'>
                        <th className='py-2 pr-4 font-medium'>When</th>
                        <th className='py-2 pr-4 font-medium'>Query</th>
                        <th className='py-2 pr-4 font-medium'>Hit</th>
                        <th className='py-2 font-medium'>ms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.recentLogs.map((l) => (
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
                          <td className='py-2 pr-4'>
                            <Badge variant={l.hit ? 'default' : 'outline'}>{l.hit ? 'hit' : 'miss'}</Badge>
                          </td>
                          <td className='py-2'>{l.latency_ms ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className='space-y-1 p-4 sm:p-6 sm:pb-2'>
        <CardDescription className='text-xs sm:text-sm'>{label}</CardDescription>
        <CardTitle className='text-xl font-semibold tabular-nums sm:text-2xl'>{value}</CardTitle>
        {hint ? <p className='text-muted-foreground text-xs'>{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{rows.length ? `${rows.length} groups` : 'No data yet'}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {rows.length === 0 ? (
          <p className='text-muted-foreground text-sm'>Upload records to see this breakdown.</p>
        ) : (
          rows.slice(0, 8).map((row) => (
            <div key={row.label} className='space-y-1'>
              <div className='flex items-center justify-between gap-2 text-sm'>
                <span className='truncate'>{row.label}</span>
                <span className='text-muted-foreground shrink-0 tabular-nums'>{row.count}</span>
              </div>
              <div className='bg-muted h-1.5 overflow-hidden rounded-full'>
                <div
                  className='bg-primary h-full rounded-full'
                  style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
