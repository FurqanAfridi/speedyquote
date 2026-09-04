import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import {
  createExtraColumnFn,
  createLookupApiKeyFn,
  deleteExtraColumnFn,
  fetchLookupApiKeys,
  revokeLookupApiKeyFn
} from '@/features/list-management/api/server';
import { slugifyColumnKey } from '@/features/list-management/lib/columns';
import { settingsOrDefault, usePortalSettings, useSavePortalSettings } from './use-portal-settings';

export function SettingsPage() {
  return (
    <PageContainer
      pageTitle='Settings'
      pageDescription='Change your name and password, list options, product names, and keys used for call lookups.'
    >
      <div className='space-y-6'>
        <AccountCard />
        <PortalCard />
        <ApiKeysCard />
      </div>
    </PageContainer>
  );
}

function AccountCard() {
  const { user } = useAuth();
  const email = user?.email ?? '';
  const [name, setName] = React.useState(
    (user?.user_metadata?.full_name as string | undefined) ?? ''
  );
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);

  React.useEffect(() => {
    setName((user?.user_metadata?.full_name as string | undefined) ?? '');
  }, [user]);

  async function saveProfile() {
    if (!supabase) {
      toast.error('Supabase is not configured');
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } });
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else toast.success('Name updated');
  }

  async function savePassword() {
    if (!supabase || !email) {
      toast.error('Supabase is not configured');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (!currentPassword) {
      toast.error('Enter your current password');
      return;
    }
    setSavingPassword(true);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword
    });
    if (signError) {
      setSavingPassword(false);
      toast.error('Current password is incorrect');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast.success('Password updated');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription className='text-base'>Your display name and password for this login.</CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='account-name'>Name</Label>
            <Input
              id='account-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Your name'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='account-email'>Email</Label>
            <Input id='account-email' value={email} disabled />
          </div>
        </div>
        <Button type='button' disabled={savingProfile} onClick={() => void saveProfile()}>
          {savingProfile ? 'Saving…' : 'Save name'}
        </Button>

        <div className='border-t pt-4'>
          <p className='mb-3 text-sm font-medium'>Change password</p>
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='current-password'>Current</Label>
              <Input
                id='current-password'
                type='password'
                autoComplete='current-password'
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='new-password'>New</Label>
              <Input
                id='new-password'
                type='password'
                autoComplete='new-password'
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='confirm-password'>Confirm</Label>
              <Input
                id='confirm-password'
                type='password'
                autoComplete='new-password'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <Button
            type='button'
            className='mt-3'
            variant='secondary'
            disabled={savingPassword}
            onClick={() => void savePassword()}
          >
            {savingPassword ? 'Updating…' : 'Update password'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PortalCard() {
  const query = usePortalSettings();
  const save = useSavePortalSettings();
  const saved = settingsOrDefault(query.data);
  const [orgName, setOrgName] = React.useState(saved.org_name);
  const [listSource, setListSource] = React.useState(saved.default_list_source);
  const [verticalName, setVerticalName] = React.useState('');
  const [colKey, setColKey] = React.useState('');
  const [colDefault, setColDefault] = React.useState('');

  React.useEffect(() => {
    if (!query.data) return;
    setOrgName(query.data.org_name);
    setListSource(query.data.default_list_source);
  }, [query.data]);

  function persist(next: Partial<typeof saved>) {
    save.mutate({ ...saved, org_name: orgName, default_list_source: listSource, ...next });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>List & data</CardTitle>
        <CardDescription className='text-base'>
          Portal name, default upload source, product names for uploads, and extra columns.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-6'>
        {query.isError && <p className='text-destructive text-sm'>{query.error.message}</p>}
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='org-name'>Organization name</Label>
            <Input id='org-name' value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='list-source'>Default list source</Label>
            <Input
              id='list-source'
              value={listSource}
              onChange={(e) => setListSource(e.target.value)}
            />
          </div>
        </div>
        <Button
          type='button'
          disabled={save.isPending}
          onClick={() => persist({})}
        >
          {save.isPending ? 'Saving…' : 'Save list settings'}
        </Button>

        <div className='grid gap-6 lg:grid-cols-2'>
          <div className='space-y-3'>
            <p className='text-base font-medium'>Products / verticals</p>
            <div className='flex flex-col gap-2 sm:flex-row'>
              <Input
                placeholder='e.g. medicare'
                value={verticalName}
                onChange={(e) => setVerticalName(e.target.value)}
              />
              <Button
                type='button'
                variant='outline'
                disabled={save.isPending}
                onClick={() => {
                  const name = verticalName.trim();
                  if (!name) return;
                  if (saved.verticals.some((v) => v.name.toLowerCase() === name.toLowerCase())) return;
                  persist({ verticals: [...saved.verticals, { name }] });
                  setVerticalName('');
                }}
              >
                Add
              </Button>
            </div>
            {saved.verticals.length === 0 ? (
              <p className='text-muted-foreground text-base'>None yet — add one before uploading.</p>
            ) : (
              <ul className='space-y-2'>
                {saved.verticals.map((v) => (
                  <li
                    key={v.name}
                    className='flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-base'
                  >
                    <span className='truncate'>{v.name}</span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() =>
                        persist({ verticals: saved.verticals.filter((x) => x.name !== v.name) })
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className='space-y-3'>
            <p className='text-sm font-medium'>Extra data columns</p>
            <p className='text-muted-foreground text-xs'>
              Fields kept from uploads that are not core database columns.
            </p>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]'>
              <Input
                placeholder='column key'
                value={colKey}
                onChange={(e) => setColKey(e.target.value)}
              />
              <Input
                placeholder='default'
                value={colDefault}
                onChange={(e) => setColDefault(e.target.value)}
              />
              <Button
                type='button'
                variant='outline'
                disabled={save.isPending}
                onClick={() => {
                  const key = slugifyColumnKey(colKey);
                  if (!key) {
                    toast.error('Enter a valid column name');
                    return;
                  }
                  void createExtraColumnFn({ data: { key, default_value: colDefault } })
                    .then(() => {
                      setColKey('');
                      setColDefault('');
                      toast.success(`Created extra data column “${key}”`);
                      void query.refetch();
                    })
                    .catch((err: Error) => toast.error(err.message));
                }}
              >
                Create
              </Button>
            </div>
            {saved.extra_columns.length === 0 ? (
              <p className='text-muted-foreground text-sm'>No extra data columns yet.</p>
            ) : (
              <ul className='space-y-2'>
                {saved.extra_columns.map((c) => (
                  <li
                    key={c.key}
                    className='flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm'
                  >
                    <span className='truncate'>
                      Extra data · {c.key}
                      {c.default_value ? (
                        <span className='text-muted-foreground'> · {c.default_value}</span>
                      ) : null}
                    </span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={() => {
                        void deleteExtraColumnFn({ data: { key: c.key } })
                          .then(() => {
                            toast.success(`Removed “${c.key}”`);
                            void query.refetch();
                          })
                          .catch((err: Error) => toast.error(err.message));
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeysCard() {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState('');
  const [revealed, setRevealed] = React.useState<string | null>(null);

  const keysQuery = useQuery({
    queryKey: ['lookup-api-keys'],
    queryFn: () => fetchLookupApiKeys()
  });

  const createMutation = useMutation({
    mutationFn: (apiName: string) => createLookupApiKeyFn({ data: { name: apiName } }),
    onSuccess: (created) => {
      setRevealed(created.token);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['lookup-api-keys'] });
      toast.success('API created — copy the token now');
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) => revokeLookupApiKeyFn({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lookup-api-keys'] });
      toast.success('API revoked');
    },
    onError: (err: Error) => toast.error(err.message)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lookup keys</CardTitle>
        <CardDescription className='text-base'>
          Create a named key for each phone system (for example Ringba). Your tech person pastes it as{' '}
          <code className='text-sm'>Authorization: Bearer …</code> when calling{' '}
          <code className='text-sm'>POST /api/pin-lookup</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {keysQuery.isError && (
          <p className='text-destructive text-sm'>{keysQuery.error.message}</p>
        )}
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Input
            placeholder='Name, e.g. Ringba live'
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type='button'
            disabled={createMutation.isPending || !name.trim()}
            onClick={() => createMutation.mutate(name.trim())}
          >
            {createMutation.isPending ? 'Creating…' : 'Create API'}
          </Button>
        </div>

        {revealed && (
          <div className='space-y-2 rounded-md border p-3'>
            <p className='text-sm font-medium'>Copy this token now. It will not be shown again.</p>
            <pre className='bg-muted overflow-x-auto rounded-md p-2 text-xs break-all whitespace-pre-wrap'>
              {revealed}
            </pre>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => {
                void navigator.clipboard.writeText(revealed);
                toast.success('Copied');
              }}
            >
              Copy
            </Button>
          </div>
        )}

        {keysQuery.isLoading ? (
          <p className='text-muted-foreground text-sm'>Loading…</p>
        ) : (keysQuery.data ?? []).length === 0 ? (
          <p className='text-muted-foreground text-sm'>No APIs yet.</p>
        ) : (
          <ul className='space-y-2'>
            {(keysQuery.data ?? []).map((key) => (
              <li
                key={key.id}
                className='flex flex-col gap-2 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between'
              >
                <div className='min-w-0'>
                  <p className='font-medium'>{key.name}</p>
                  <p className='text-muted-foreground font-mono text-xs'>{key.token_prefix}</p>
                  <p className='text-muted-foreground text-xs'>
                    Created {new Date(key.created_at).toLocaleDateString()}
                    {key.last_used_at
                      ? ` · last used ${new Date(key.last_used_at).toLocaleString()}`
                      : ' · never used'}
                  </p>
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  disabled={revokeMutation.isPending}
                  onClick={() => revokeMutation.mutate(key.id)}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}

        <ApiUsageGuide token={revealed} />
      </CardContent>
    </Card>
  );
}

function ApiUsageGuide({ token }: { token: string | null }) {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';
  const url = `${origin}/api/pin-lookup`;
  const bearer = token ?? 'YOUR_API_TOKEN';

  const curlPin = `curl -X POST '${url}' \\
  -H 'Authorization: Bearer ${bearer}' \\
  -H 'Content-Type: application/json' \\
  -d '{"pin":"ABC123"}'`;

  const curlZip = `curl -X POST '${url}' \\
  -H 'Authorization: Bearer ${bearer}' \\
  -H 'Content-Type: application/json' \\
  -d '{"zip":"78242"}'`;

  const curlAni = `curl -X POST '${url}' \\
  -H 'Authorization: Bearer ${bearer}' \\
  -H 'Content-Type: application/json' \\
  -d '{"caller_id":"2105550100"}'`;

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success('Copied');
  }

  return (
    <div className='space-y-4 rounded-md border p-4'>
      <div>
        <p className='text-sm font-medium'>How to use this API</p>
        <p className='text-muted-foreground text-sm'>
          Ringba (or any HTTP client) sends one lookup per call. Create a token above, then use it as
          the Bearer token.
        </p>
      </div>

      <dl className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2'>
        <div>
          <dt className='text-muted-foreground'>Method</dt>
          <dd className='font-mono'>POST</dd>
        </div>
        <div className='min-w-0'>
          <dt className='text-muted-foreground'>URL</dt>
          <dd className='font-mono break-all'>{url}</dd>
        </div>
        <div className='sm:col-span-2'>
          <dt className='text-muted-foreground'>Header</dt>
          <dd className='font-mono break-all'>Authorization: Bearer {bearer}</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>Content-Type</dt>
          <dd className='font-mono'>application/json</dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>Match order</dt>
          <dd>PIN first, then caller ID, then ZIP</dd>
        </div>
      </dl>

      <div className='space-y-2 text-sm'>
        <p className='font-medium'>JSON body — send one of these</p>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs'>{`{
  "pin": "ABC123"
}`}</pre>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs'>{`{
  "zip": "78242"
}`}</pre>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs'>{`{
  "caller_id": "2105550100"
}`}</pre>
        <p className='text-muted-foreground text-xs'>
          Also accepted: <code>PIN</code>, <code>pin_code</code>, <code>ANI</code>, <code>phone</code>,{' '}
          <code>postal_code</code>. Optional <code>call_id</code> is stored on the lookup log.
        </p>
      </div>

      <div className='space-y-2 text-sm'>
        <div className='flex items-center justify-between gap-2'>
          <p className='font-medium'>cURL — lookup by PIN</p>
          <Button type='button' size='sm' variant='outline' onClick={() => copy(curlPin)}>
            Copy
          </Button>
        </div>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre'>{curlPin}</pre>
        <p className='font-medium'>ZIP</p>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre'>{curlZip}</pre>
        <p className='font-medium'>Caller ID</p>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs whitespace-pre'>{curlAni}</pre>
      </div>

      <div className='space-y-2 text-sm'>
        <p className='font-medium'>Success response</p>
        <pre className='bg-muted overflow-x-auto rounded-md p-3 text-xs'>{`{
  "match_method": "pin",
  "match_count": 1,
  "record_id": 12,
  "piece_id": 8,
  "pin": "ABC123",
  "vertical": "medicare",
  "state": "TX",
  "zip": "78242",
  "city": "San Antonio",
  "age": 67,
  "age_band": "65-69",
  "homeowner_status": "owner",
  "attributes": { "mail_code": "A1" }
}`}</pre>
        <p className='text-muted-foreground text-xs'>
          <code>match_method</code> is <code>pin</code>, <code>ani</code>, <code>zip</code>, or{' '}
          <code>unmatched</code>. Name and street address are never returned. HTTP 401 = bad token, 503
          = no API created yet.
        </p>
      </div>

      <div className='space-y-1 text-sm'>
        <p className='font-medium'>Ringba</p>
        <p className='text-muted-foreground'>
          HTTP request URL: <span className='font-mono text-foreground'>{url}</span>
          <br />
          Method: POST. Header Authorization = Bearer and your token. Body JSON with the PIN (or ZIP /
          ANI) field Ringba collected on the call.
        </p>
      </div>
    </div>
  );
}
