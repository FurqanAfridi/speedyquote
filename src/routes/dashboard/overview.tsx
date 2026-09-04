import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Activity, Database, KeyRound, Phone, Timer, MapPin } from 'lucide-react';
import PageContainer from '@/components/layout/page-container';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const org = settingsQuery.data?.org_name?.trim() || 'Speedy Quote';
  const hitRate = d && d.lookupCount > 0 ? (d.hitCount / d.lookupCount) * 100 : null;
  const hitRate24h = d && d.lookupsLast24h > 0 ? (d.hitsLast24h / d.lookupsLast24h) * 100 : null;
  const pinCoverage = d && d.recordCount > 0 ? (d.pinCount / d.recordCount) * 100 : null;
  const phoneCoverage = d && d.recordCount > 0 ? (d.withPhoneCount / d.recordCount) * 100 : null;

  return (
    <PageContainer
      pageTitle={`${org} overview`}
      pageDescription='A simple summary of your mailing list and how often lookups find a match.'
    >
      {query.isLoading && <p className='text-muted-foreground text-base'>Loading…</p>}
      {query.error && <p className='text-destructive text-base'>{query.error.message}</p>}
      {d && (
        <div className='space-y-8'>
          <div className='overflow-hidden rounded-2xl border border-teal-500/20 bg-gradient-to-br from-white via-teal-50/80 to-cyan-50 p-6 shadow-sm ring-1 ring-teal-500/10 dark:from-card dark:via-teal-950/30 dark:to-card sm:p-8'>
            <div className='flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between'>
              <div className='max-w-xl space-y-3'>
                <p className='text-sm font-semibold tracking-wide text-teal-700 dark:text-teal-300'>
                  Your list right now
                </p>
                <h2 className='text-3xl font-semibold tracking-tight sm:text-4xl'>
                  {d.recordCount.toLocaleString()} people
                  <span className='text-muted-foreground font-normal'> · </span>
                  {d.pinCount.toLocaleString()} with PINs
                </h2>
                <p className='text-muted-foreground text-base leading-relaxed'>
                  {d.recordsLast7Days} added in the last 7 days.
                  {d.missingPinCount > 0
                    ? ` ${d.missingPinCount.toLocaleString()} still need a PIN.`
                    : ' Every person has a PIN.'}{' '}
                  When someone calls, we look up PIN first, then phone number, then ZIP.
                </p>
              </div>
              <div className='flex flex-wrap gap-3'>
                <Button asChild size='lg'>
                  <Link to='/dashboard/list-management'>Go to Records</Link>
                </Button>
                <Button asChild size='lg' variant='outline'>
                  <Link to='/dashboard/pin-diagnostics'>Try a lookup</Link>
                </Button>
              </div>
            </div>
            <div className='mt-8 grid gap-4 sm:grid-cols-3'>
              <CoverageStat
                label='People with a PIN'
                value={pinCoverage != null ? `${pinCoverage.toFixed(0)}%` : '—'}
                detail={`${d.pinCount.toLocaleString()} of ${d.recordCount.toLocaleString()}`}
              />
              <CoverageStat
                label='Phone on file'
                value={phoneCoverage != null ? `${phoneCoverage.toFixed(0)}%` : '—'}
                detail={`${d.withPhoneCount.toLocaleString()} with a known number`}
              />
              <CoverageStat
                label='Lookups that found a match'
                value={hitRate != null ? `${hitRate.toFixed(0)}%` : '—'}
                detail={
                  hitRate24h != null
                    ? `${hitRate24h.toFixed(0)}% in the last 24 hours`
                    : `${d.lookupCount.toLocaleString()} lookups total`
                }
              />
            </div>
          </div>

          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <Kpi
              icon={<Database className='size-5' />}
              label='People on list'
              value={d.recordCount.toLocaleString()}
              hint={`${d.uniqueVerticals} products · ${d.uniqueStates} states`}
            />
            <Kpi
              icon={<KeyRound className='size-5' />}
              label='Missing PINs'
              value={d.missingPinCount.toLocaleString()}
              hint={d.missingPinCount === 0 ? 'Everyone has a PIN' : 'These cannot match by PIN'}
            />
            <Kpi
              icon={<Activity className='size-5' />}
              label='Lookups today'
              value={d.lookupsLast24h.toLocaleString()}
              hint={`${d.hitsLast24h.toLocaleString()} found a match`}
            />
            <Kpi
              icon={<Timer className='size-5' />}
              label='Average speed'
              value={d.avgLatencyMs != null ? `${d.avgLatencyMs} ms` : '—'}
              hint={`${d.lookupCount.toLocaleString()} lookups total`}
            />
          </div>

          <div className='grid gap-6 lg:grid-cols-2'>
            <BreakdownCard title='By product' description='How the list splits by product type' rows={d.byVertical} />
            <BreakdownCard title='By state' description='Top states in your list' rows={d.byState} />
            <BreakdownCard title='By list source' description='Where records were uploaded from' rows={d.byListSource} />
            <BreakdownCard
              title='Homeowner status'
              description='From the homeowner field on each person'
              rows={d.byHomeowner}
            />
          </div>

          <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]'>
            <Card>
              <CardHeader className='flex flex-row items-start justify-between gap-4'>
                <div>
                  <CardTitle>Recent lookups</CardTitle>
                  <CardDescription className='text-base'>
                    Latest matches and misses when callers are looked up
                  </CardDescription>
                </div>
                <Button asChild variant='outline' className='shrink-0'>
                  <Link to='/dashboard/pin-diagnostics'>See all</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {d.recentLogs.length === 0 ? (
                  <p className='text-muted-foreground text-base'>
                    No lookups yet. Open Lookups and try a test.
                  </p>
                ) : (
                  <div className='-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0'>
                    <table className='w-full min-w-[28rem] text-left text-base'>
                      <thead>
                        <tr className='border-b'>
                          <th className='py-3 pr-4 font-medium'>When</th>
                          <th className='py-3 pr-4 font-medium'>Query</th>
                          <th className='py-3 pr-4 font-medium'>Result</th>
                          <th className='py-3 font-medium'>Speed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.recentLogs.map((l) => (
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
                            <td className='py-3 pr-4'>
                              <Badge variant={l.hit ? 'default' : 'outline'}>
                                {l.hit ? 'Found' : 'Not found'}
                              </Badge>
                            </td>
                            <td className='py-3 tabular-nums'>
                              {l.latency_ms != null ? `${l.latency_ms} ms` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How matches were found</CardTitle>
                <CardDescription className='text-base'>What we used to find the person</CardDescription>
              </CardHeader>
              <CardContent>
                <BreakdownList rows={d.byLookupMethod} empty='No lookups logged yet.' />
                <div className='text-muted-foreground mt-5 space-y-3 border-t pt-4 text-sm'>
                  <p className='flex items-center gap-2'>
                    <Phone className='size-4 shrink-0' />
                    Phone uses the number on the record
                  </p>
                  <p className='flex items-center gap-2'>
                    <MapPin className='size-4 shrink-0' />
                    ZIP is used only if PIN and phone do not match
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function CoverageStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className='rounded-xl border border-white/80 bg-white/70 px-4 py-4 shadow-sm dark:border-border dark:bg-background/50'>
      <p className='text-muted-foreground text-sm font-medium'>{label}</p>
      <p className='mt-1 text-2xl font-semibold tabular-nums'>{value}</p>
      <p className='text-muted-foreground mt-1 truncate text-sm'>{detail}</p>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className='overflow-hidden border-0 bg-card shadow-sm ring-1 ring-border/60'>
      <CardHeader className='space-y-2 p-5 sm:p-6'>
        <div className='text-teal-700 dark:text-teal-300'>{icon}</div>
        <CardDescription className='text-sm font-medium'>{label}</CardDescription>
        <CardTitle className='text-2xl font-semibold tabular-nums sm:text-3xl'>{value}</CardTitle>
        {hint ? <p className='text-muted-foreground text-sm'>{hint}</p> : null}
      </CardHeader>
    </Card>
  );
}

function BreakdownCard({
  title,
  description,
  rows
}: {
  title: string;
  description: string;
  rows: Array<{ label: string; count: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <BreakdownList rows={rows} empty='Upload records to see this breakdown.' />
      </CardContent>
    </Card>
  );
}

function BreakdownList({
  rows,
  empty
}: {
  rows: Array<{ label: string; count: number }>;
  empty: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0) || 1;
  if (rows.length === 0) {
    return <p className='text-muted-foreground text-base'>{empty}</p>;
  }
  return (
    <div className='space-y-3'>
      {rows.slice(0, 8).map((row) => (
        <div key={row.label} className='space-y-1.5'>
          <div className='flex items-center justify-between gap-2 text-base'>
            <span className='truncate'>{row.label}</span>
            <span className='text-muted-foreground shrink-0 tabular-nums'>
              {row.count.toLocaleString()} · {Math.round((row.count / total) * 100)}%
            </span>
          </div>
          <div className='bg-muted h-2 overflow-hidden rounded-full'>
            <div
              className='h-full rounded-full bg-teal-600'
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
