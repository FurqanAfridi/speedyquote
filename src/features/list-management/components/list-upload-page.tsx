import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  deleteRecordsFn,
  getListUploadOptions,
  updatePortalSettings,
  updateRecordFn,
  uploadMailingList
} from '@/features/list-management/api/server';
import { DEFAULT_PORTAL_SETTINGS } from '@/features/list-management/api/types';
import type {
  ColumnMapping,
  MappedField,
  PortalSettings,
  RecordMutationInput,
  UploadedPiece
} from '@/features/list-management/api/types';
import {
  applyMapping,
  FIELD_LABELS,
  formatPinDisplay,
  guessMapping,
  parseDelimited
} from '@/features/list-management/lib/csv';
import {
  CORE_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  attrColumnId,
  isColumnVisible
} from '@/features/list-management/lib/columns';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { RecordFormDialog } from '@/features/list-management/components/record-form-dialog';

async function fileToRows(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false
    });
    if (matrix.length < 2) return { headers: [], rows: [] };
    const headers = (matrix[0] ?? []).map((h) => String(h).trim()).filter(Boolean);
    const rows = matrix.slice(1).map((line) => {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = String(line[i] ?? '').trim();
      });
      return row;
    });
    return { headers, rows };
  }
  return parseDelimited(await file.text());
}

function rowSearchBlob(row: UploadedPiece): string {
  const parts = [
    row.pin_code,
    row.first_name,
    row.last_name,
    row.address1,
    row.city,
    row.state,
    row.zip,
    row.zip4,
    row.age,
    row.homeowner_status,
    row.known_phone,
    row.vertical,
    row.list_source,
    ...Object.entries(row.attrs).flat()
  ];
  return parts
    .filter((v) => v != null && v !== '')
    .map((v) => String(v).toLowerCase())
    .join(' ');
}

function cellValue(row: UploadedPiece, id: string): string {
  switch (id) {
    case 'pin':
      return row.pin_code ? formatPinDisplay(row.pin_code) : '—';
    case 'vertical':
      return row.vertical ?? '—';
    case 'name':
      return [row.first_name, row.last_name].filter(Boolean).join(' ') || '—';
    case 'address1':
      return row.address1 ?? '—';
    case 'city':
      return row.city ?? '—';
    case 'state':
      return row.state ?? '—';
    case 'zip':
      return row.zip4 ? `${row.zip}-${row.zip4}` : (row.zip ?? '—');
    case 'phone':
      return row.known_phone ?? '—';
    case 'homeowner':
      return row.homeowner_status ?? '—';
    case 'age':
      return row.age != null ? String(row.age) : '—';
    case 'list_source':
      return row.list_source ?? '—';
    default:
      if (id.startsWith('attr:')) return row.attrs[id.slice(5)] ?? '—';
      return '—';
  }
}

export function ListUploadPage() {
  const queryClient = useQueryClient();
  const optionsQuery = useQuery({
    queryKey: ['list-upload-options'],
    queryFn: () => getListUploadOptions()
  });

  const settings: PortalSettings = optionsQuery.data?.settings ?? DEFAULT_PORTAL_SETTINGS;

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rawRows, setRawRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<ColumnMapping>({});
  const [listSource, setListSource] = React.useState('');
  const [vertical, setVertical] = React.useState('');
  const [newCol, setNewCol] = React.useState('');
  const [newColValue, setNewColValue] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [filterState, setFilterState] = React.useState('');
  const [filterVertical, setFilterVertical] = React.useState('');
  const [page, setPage] = React.useState(0);
  const pageSize = 20;
  const [selected, setSelected] = React.useState<number[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UploadedPiece | null>(null);
  const [deleteIds, setDeleteIds] = React.useState<number[] | null>(null);

  React.useEffect(() => {
    if (!optionsQuery.data?.settings) return;
    setListSource((cur) => cur || optionsQuery.data!.settings!.default_list_source);
    setVertical((cur) => {
      if (cur) return cur;
      return optionsQuery.data!.settings!.verticals[0]?.name ?? '';
    });
  }, [optionsQuery.data?.settings]);

  const mapped = applyMapping(rawRows, mapping);

  const uploadMutation = useMutation({
    mutationFn: (input: Parameters<typeof uploadMailingList>[0]['data']) =>
      uploadMailingList({ data: input }),
    onSuccess: (result) => {
      toast.success(`Saved ${result.recordsInserted} records`);
      void queryClient.invalidateQueries({ queryKey: ['list-upload-options'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const saveRecord = useMutation({
    mutationFn: (data: RecordMutationInput) => {
      if (data.record_id) return updateRecordFn({ data });
      return uploadMailingList({
        data: {
          records: [
            {
              pin: data.pin,
              first_name: data.first_name,
              last_name: data.last_name,
              address1: data.address1,
              city: data.city,
              state: data.state,
              zip: data.zip,
              zip4: data.zip4,
              age: data.age,
              homeowner_status: data.homeowner_status,
              known_phone: data.known_phone,
              list_source: data.list_source,
              vertical: data.vertical,
              attrs: data.attrs
            }
          ],
          listSource: data.list_source,
          vertical: data.vertical
        }
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'Record updated' : 'Record created');
      setFormOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['list-upload-options'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const removeRecords = useMutation({
    mutationFn: (recordIds: number[]) => deleteRecordsFn({ data: { recordIds } }),
    onSuccess: (result) => {
      toast.success(`Deleted ${result.deleted} record${result.deleted === 1 ? '' : 's'}`);
      setSelected([]);
      setDeleteIds(null);
      void queryClient.invalidateQueries({ queryKey: ['list-upload-options'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const saveColumns = useMutation({
    mutationFn: (next: PortalSettings) => updatePortalSettings({ data: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['portal-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['list-upload-options'] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  async function onFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const parsed = await fileToRows(file);
    let nextHeaders = [...parsed.headers];
    let nextRows = parsed.rows;
    for (const col of settings.extra_columns) {
      if (!nextHeaders.includes(col.key)) {
        nextHeaders.push(col.key);
        nextRows = nextRows.map((r) => ({ ...r, [col.key]: col.default_value }));
      }
    }
    setHeaders(nextHeaders);
    setRawRows(nextRows);
    const guessed = guessMapping(nextHeaders);
    for (const col of settings.extra_columns) {
      if (!guessed[col.key]) guessed[col.key] = 'attrs';
    }
    setMapping(guessed);
  }

  function addColumn() {
    const name = newCol.trim();
    if (!name) {
      toast.error('Enter a column name');
      return;
    }
    if (headers.includes(name)) {
      toast.error('That column already exists');
      return;
    }
    setHeaders((h) => [...h, name]);
    setMapping((m) => ({ ...m, [name]: 'attrs' }));
    setRawRows((rows) => rows.map((r) => ({ ...r, [name]: newColValue })));
    setNewCol('');
    setNewColValue('');
    toast.success(`Added column “${name}”`);
  }

  const recent = optionsQuery.data?.recentPins ?? [];
  const attrKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const r of recent) Object.keys(r.attrs ?? {}).forEach((k) => keys.add(k));
    for (const c of settings.extra_columns) keys.add(c.key);
    return [...keys].sort();
  }, [recent, settings.extra_columns]);

  const allColumnDefs = React.useMemo(
    () => [
      ...CORE_COLUMNS.map((c) => ({ id: c.id, label: c.label })),
      ...attrKeys.map((k) => ({ id: attrColumnId(k), label: k }))
    ],
    [attrKeys]
  );

  const visibleIds = settings.visible_columns;
  const shownColumns = allColumnDefs.filter((c) => isColumnVisible(visibleIds, c.id));

  const states = React.useMemo(
    () => [...new Set(recent.map((r) => r.state).filter(Boolean) as string[])].sort(),
    [recent]
  );
  const verticalsInData = React.useMemo(
    () => [...new Set(recent.map((r) => r.vertical).filter(Boolean) as string[])].sort(),
    [recent]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return recent.filter((r) => {
      if (filterState && r.state !== filterState) return false;
      if (filterVertical && r.vertical !== filterVertical) return false;
      if (q && !rowSearchBlob(r).includes(q)) return false;
      return true;
    });
  }, [recent, search, filterState, filterVertical]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  React.useEffect(() => {
    setPage(0);
  }, [search, filterState, filterVertical]);

  function toggleColumn(id: string, checked: boolean) {
    const base = visibleIds.length ? visibleIds : [...DEFAULT_VISIBLE_COLUMNS];
    const next = checked ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    saveColumns.mutate({ ...settings, visible_columns: next });
  }

  return (
    <PageContainer
      pageTitle='Records'
      pageDescription='Upload lists, pick columns, and manage every row.'
    >
      <div className='flex min-w-0 flex-col gap-6'>
      <Card className='min-w-0 overflow-hidden'>
        <CardHeader>
          <CardTitle>Upload CSV or Excel</CardTitle>
          <CardDescription>
            Map PIN (this file uses key_code). Extra columns are stored automatically. Choose a vertical
            from Settings.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='csv'>File</Label>
              <Input
                id='csv'
                type='file'
                accept='.csv,.xlsx,.xls,text/csv'
                onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              />
              {fileName && (
                <p className='text-muted-foreground text-sm'>
                  {fileName} — {rawRows.length} rows
                </p>
              )}
            </div>
            <div className='space-y-2'>
              <Label htmlFor='vertical'>Vertical</Label>
              {settings.verticals.length > 0 ? (
                <select
                  id='vertical'
                  className='border-input bg-background h-9 w-full rounded-md border px-2 text-sm'
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                >
                  {settings.verticals.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  Create verticals in Settings first.
                </p>
              )}
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='list-source'>List source</Label>
            <Input id='list-source' value={listSource} onChange={(e) => setListSource(e.target.value)} />
          </div>

          {headers.length > 0 && (
            <div className='space-y-2'>
              <Label>Column mapping</Label>
              <div className='max-h-64 space-y-2 overflow-auto'>
                {headers.map((h) => (
                  <div key={h} className='grid grid-cols-1 items-center gap-2 sm:grid-cols-2'>
                    <span className='truncate text-sm'>{h}</span>
                    <select
                      className='border-input bg-background h-9 rounded-md border px-2 text-sm'
                      value={mapping[h] ?? 'attrs'}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [h]: e.target.value as MappedField }))
                      }
                    >
                      {FIELD_LABELS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className='text-muted-foreground text-sm'>
                {mapped.records.length} rows will be saved
                {mapped.skippedNoPin ? ` · ${mapped.skippedNoPin} without PIN` : ''}
              </p>
            </div>
          )}

          <div className='grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]'>
            <div className='space-y-2'>
              <Label htmlFor='new-col'>New column</Label>
              <Input
                id='new-col'
                placeholder='e.g. lead_source'
                value={newCol}
                onChange={(e) => setNewCol(e.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='new-col-val'>Default value</Label>
              <Input
                id='new-col-val'
                placeholder='optional'
                value={newColValue}
                onChange={(e) => setNewColValue(e.target.value)}
              />
            </div>
            <div className='flex items-end'>
              <Button type='button' variant='outline' onClick={addColumn}>
                Add column
              </Button>
            </div>
          </div>

          <Button
            type='button'
            disabled={uploadMutation.isPending || !mapped.records.length || !vertical}
            onClick={() =>
              uploadMutation.mutate({
                records: mapped.records,
                listSource,
                vertical: vertical.trim() || null
              })
            }
          >
            {uploadMutation.isPending ? 'Saving…' : 'Save records'}
          </Button>
        </CardContent>
      </Card>

      <Card className='mt-0 min-w-0 overflow-hidden'>
        <CardHeader className='gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0'>
            <CardTitle>Stored records</CardTitle>
            <CardDescription>
              {filtered.length} match
              {recent.length !== filtered.length ? ` of ${recent.length}` : ''}
            </CardDescription>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              size='sm'
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              New record
            </Button>
            {selected.length > 0 && (
              <Button
                type='button'
                size='sm'
                variant='destructive'
                onClick={() => setDeleteIds(selected)}
              >
                Delete selected ({selected.length})
              </Button>
            )}
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type='button' variant='outline' size='sm'>
                Filter columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='max-h-72 w-56'>
              <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allColumnDefs.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={isColumnVisible(visibleIds, col.id)}
                  onCheckedChange={(v) => toggleColumn(col.id, v === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className='min-w-0 space-y-3'>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
            <Input
              placeholder='Search all columns…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className='border-input bg-background h-9 min-w-0 rounded-md border px-2 text-sm'
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
            >
              <option value=''>All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className='border-input bg-background h-9 min-w-0 rounded-md border px-2 text-sm'
              value={filterVertical}
              onChange={(e) => setFilterVertical(e.target.value)}
            >
              <option value=''>All verticals</option>
              {verticalsInData.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {optionsQuery.isLoading ? (
            <p className='text-muted-foreground text-sm'>Loading…</p>
          ) : shownColumns.length === 0 ? (
            <p className='text-muted-foreground text-sm'>Use Filter columns to pick fields to show.</p>
          ) : recent.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No records yet. Upload a file.</p>
          ) : filtered.length === 0 ? (
            <p className='text-muted-foreground text-sm'>No rows match the search or filters.</p>
          ) : (
            <>
              <div className='w-full min-w-0 overflow-hidden rounded-md border'>
                <div className='max-h-[min(28rem,55vh)] overflow-auto'>
                  <table className='w-max min-w-full text-left text-sm'>
                    <thead className='bg-background sticky top-0 z-10'>
                      <tr className='border-b'>
                        <th className='w-10 px-3 py-2'>
                          <Checkbox
                            checked={
                              paged.length > 0 && paged.every((p) => selected.includes(p.record_id))
                            }
                            onCheckedChange={(v) => {
                              const ids = paged.map((p) => p.record_id);
                              setSelected((cur) =>
                                v === true
                                  ? [...new Set([...cur, ...ids])]
                                  : cur.filter((id) => !ids.includes(id))
                              );
                            }}
                            aria-label='Select page'
                          />
                        </th>
                        {shownColumns.map((c) => (
                          <th
                            key={c.id}
                            className='text-muted-foreground px-3 py-2 font-medium whitespace-nowrap'
                          >
                            {c.label}
                          </th>
                        ))}
                        <th className='text-muted-foreground px-3 py-2 font-medium whitespace-nowrap'>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((p) => (
                        <tr key={p.record_id} className='border-b border-border/60 last:border-0'>
                          <td className='px-3 py-2'>
                            <Checkbox
                              checked={selected.includes(p.record_id)}
                              onCheckedChange={(v) =>
                                setSelected((cur) =>
                                  v === true
                                    ? [...cur, p.record_id]
                                    : cur.filter((id) => id !== p.record_id)
                                )
                              }
                              aria-label={`Select ${p.record_id}`}
                            />
                          </td>
                          {shownColumns.map((c) => {
                            const value = cellValue(p, c.id);
                            return (
                              <td
                                key={c.id}
                                className={`px-3 py-2 whitespace-nowrap ${c.id === 'pin' ? 'font-mono' : ''}`}
                              >
                                {value}
                              </td>
                            );
                          })}
                          <td className='px-3 py-2 whitespace-nowrap'>
                            <div className='flex gap-1'>
                              <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                onClick={() => {
                                  setEditing(p);
                                  setFormOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                type='button'
                                size='sm'
                                variant='ghost'
                                onClick={() => setDeleteIds([p.record_id])}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                <p className='text-muted-foreground'>
                  Page {safePage + 1} of {pageCount} · {paged.length} rows
                </p>
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={safePage <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>
      <RecordFormDialog
        open={formOpen}
        record={editing}
        settings={settings}
        extraKeys={attrKeys}
        pending={saveRecord.isPending}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSave={(data) => saveRecord.mutate(data)}
      />
      <AlertDialog open={Boolean(deleteIds?.length)} onOpenChange={(open) => !open && setDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteIds?.length === 1 ? 'this record' : `${deleteIds?.length ?? 0} records`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the row and its PIN from lookup. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeRecords.isPending}
              onClick={() => {
                if (deleteIds?.length) removeRecords.mutate(deleteIds);
              }}
            >
              {removeRecords.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
