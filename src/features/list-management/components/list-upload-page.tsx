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
  deleteUploadBatchFn,
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
  formatPinDisplay,
  getMappingOptions,
  guessMapping,
  parseDelimited
} from '@/features/list-management/lib/csv';
import {
  CORE_COLUMNS,
  attrColumnId,
  defaultBatchTimestamp,
  resolveVisibleColumnIds
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
    row.batch_id,
    ...Object.entries(row.attrs).flat()
  ];
  return parts
    .filter((v) => v != null && v !== '')
    .map((v) => String(v).toLowerCase())
    .join(' ');
}

function cellValue(row: UploadedPiece, id: string, batchLabelById?: Map<number, string>): string {
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
    case 'batch':
      if (row.batch_id == null) return '—';
      return batchLabelById?.get(row.batch_id) ?? `Upload #${row.batch_id}`;
    default:
      if (id.startsWith('attr:')) return row.attrs[id.slice(5)] ?? '—';
      return '—';
  }
}

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10 per page' },
  { value: 20, label: '20 per page' },
  { value: 50, label: '50 per page' },
  { value: 100, label: '100 per page' },
  { value: 200, label: '200 per page' },
  { value: 0, label: 'Show everyone' }
] as const;

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
  const [vertical, setVertical] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [filterState, setFilterState] = React.useState('');
  const [filterVertical, setFilterVertical] = React.useState('');
  const [filterHomeowner, setFilterHomeowner] = React.useState('');
  const [filterBatch, setFilterBatch] = React.useState('');
  const [filterPin, setFilterPin] = React.useState<'all' | 'with' | 'without'>('all');
  const [batchLabel, setBatchLabel] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UploadedPiece | null>(null);
  const [deleteIds, setDeleteIds] = React.useState<number[] | null>(null);
  const [deleteBatchId, setDeleteBatchId] = React.useState<number | null>(null);
  const [columnDraft, setColumnDraft] = React.useState<string[] | null>(null);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [batchesOpen, setBatchesOpen] = React.useState(false);
  const strippedExtraVisible = React.useRef(false);

  React.useEffect(() => {
    if (!optionsQuery.data?.settings) return;
    setVertical((cur) => {
      if (cur) return cur;
      return optionsQuery.data!.settings!.verticals[0]?.name ?? '';
    });
  }, [optionsQuery.data?.settings]);

  const mapped = applyMapping(rawRows, mapping);
  const pendingNewColumns = mapped.newExtraKeys.filter(
    (k) => !settings.extra_columns.some((c) => c.key === k)
  );

  const uploadMutation = useMutation({
    mutationFn: (input: Parameters<typeof uploadMailingList>[0]['data']) =>
      uploadMailingList({ data: input }),
    onSuccess: (result) => {
      const batchNote = result.batch ? ` as “${result.batch.label}”` : '';
      toast.success(`Saved ${result.recordsInserted} records${batchNote}`);
      setBatchLabel('');
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
      toast.success(`Removed ${result.deleted} record${result.deleted === 1 ? '' : 's'} from the portal`);
      setSelected([]);
      setDeleteIds(null);
      void queryClient.invalidateQueries({ queryKey: ['list-upload-options'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const removeBatch = useMutation({
    mutationFn: (batchId: number) => deleteUploadBatchFn({ data: { batchId } }),
    onSuccess: (result, batchId) => {
      toast.success(`Removed upload from portal (${result.deleted} records)`);
      setDeleteBatchId(null);
      setFilterBatch((cur) => (cur && Number(cur) === batchId ? '' : cur));
      setSelected([]);
      void queryClient.invalidateQueries({ queryKey: ['list-upload-options'] });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  const saveColumns = useMutation({
    mutationFn: (next: PortalSettings) => updatePortalSettings({ data: next }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['portal-settings'], saved);
      queryClient.setQueryData(['list-upload-options'], (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        return { ...(old as Record<string, unknown>), settings: saved };
      });
    },
    onError: (err: Error) => toast.error(err.message)
  });

  // Extra columns used to be auto-added to visible_columns; strip them once so only DB columns show by default.
  React.useEffect(() => {
    if (strippedExtraVisible.current || !optionsQuery.data?.settings) return;
    const vis = optionsQuery.data.settings.visible_columns;
    if (!vis.some((id) => id.startsWith('attr:'))) {
      strippedExtraVisible.current = true;
      return;
    }
    strippedExtraVisible.current = true;
    const cleaned = vis.filter((id) => !id.startsWith('attr:'));
    saveColumns.mutate({
      ...optionsQuery.data.settings,
      visible_columns: cleaned.length ? cleaned : CORE_COLUMNS.map((c) => c.id)
    });
  }, [optionsQuery.data?.settings]);

  async function onFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const parsed = await fileToRows(file);
    setHeaders(parsed.headers);
    setRawRows(parsed.rows);
    setMapping(guessMapping(parsed.headers, settings.extra_columns));
  }

  const mappingOptions = React.useMemo(
    () => getMappingOptions(settings.extra_columns),
    [settings.extra_columns]
  );

  const recent = optionsQuery.data?.recentPins ?? [];
  const batches = optionsQuery.data?.batches ?? [];
  const batchLabelById = React.useMemo(
    () => new Map(batches.map((b) => [b.batch_id, b.label])),
    [batches]
  );
  const attrKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const r of recent) Object.keys(r.attrs ?? {}).forEach((k) => keys.add(k));
    for (const c of settings.extra_columns) keys.add(c.key);
    return [...keys].sort();
  }, [recent, settings.extra_columns]);

  const allColumnDefs = React.useMemo(
    () => [
      { id: 'batch', label: 'Upload' },
      ...CORE_COLUMNS.map((c) => ({ id: c.id, label: c.label })),
      ...attrKeys.map((k) => ({ id: attrColumnId(k), label: `Extra · ${k}` }))
    ],
    [attrKeys]
  );

  const visibleIds = settings.visible_columns;
  const activeVisible = columnDraft ?? resolveVisibleColumnIds(visibleIds);
  const shownColumns = allColumnDefs.filter((c) => activeVisible.includes(c.id));
  const coreColumnDefs = allColumnDefs.filter((c) => !c.id.startsWith('attr:'));
  const extraColumnDefs = allColumnDefs.filter((c) => c.id.startsWith('attr:'));

  const states = React.useMemo(
    () => [...new Set(recent.map((r) => r.state).filter(Boolean) as string[])].sort(),
    [recent]
  );
  const verticalsInData = React.useMemo(
    () => [...new Set(recent.map((r) => r.vertical).filter(Boolean) as string[])].sort(),
    [recent]
  );
  const homeownersInData = React.useMemo(
    () => [...new Set(recent.map((r) => r.homeowner_status).filter(Boolean) as string[])].sort(),
    [recent]
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const batchId = filterBatch ? Number(filterBatch) : null;
    return recent.filter((r) => {
      if (filterState && r.state !== filterState) return false;
      if (filterVertical && r.vertical !== filterVertical) return false;
      if (filterHomeowner && r.homeowner_status !== filterHomeowner) return false;
      if (batchId != null && Number.isFinite(batchId) && r.batch_id !== batchId) return false;
      if (filterPin === 'with' && !r.pin_code) return false;
      if (filterPin === 'without' && r.pin_code) return false;
      if (q && !rowSearchBlob(r).includes(q)) return false;
      return true;
    });
  }, [recent, search, filterState, filterVertical, filterHomeowner, filterBatch, filterPin]);

  const pageCount = Math.max(1, pageSize > 0 ? Math.ceil(filtered.length / pageSize) : 1);
  const safePage = Math.min(page, pageCount - 1);
  const paged =
    pageSize > 0
      ? filtered.slice(safePage * pageSize, safePage * pageSize + pageSize)
      : filtered;

  React.useEffect(() => {
    setPage(0);
  }, [search, filterState, filterVertical, filterHomeowner, filterBatch, filterPin, pageSize]);

  function clearFilters() {
    setSearch('');
    setFilterState('');
    setFilterVertical('');
    setFilterHomeowner('');
    setFilterBatch('');
    setFilterPin('all');
  }

  function toggleColumn(id: string, checked: boolean) {
    setColumnDraft((cur) => {
      const base = cur ?? resolveVisibleColumnIds(visibleIds);
      return checked ? [...new Set([...base, id])] : base.filter((x) => x !== id);
    });
  }

  function onColumnMenuOpenChange(open: boolean) {
    if (open) {
      setColumnDraft(resolveVisibleColumnIds(visibleIds));
      return;
    }
    setColumnDraft((draft) => {
      if (!draft) return null;
      const prev = resolveVisibleColumnIds(visibleIds);
      const same =
        draft.length === prev.length && draft.every((id, i) => id === prev[i]);
      if (!same) {
        saveColumns.mutate({ ...settings, visible_columns: draft });
      }
      return null;
    });
  }

  return (
    <PageContainer
      pageTitle='Records'
      pageDescription='Find people in your list, upload a new file, or review past uploads. Large buttons and clear labels make each step easy to follow.'
    >
      <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end'>
        <Button
          type='button'
          size='lg'
          variant={uploadOpen ? 'secondary' : 'default'}
          onClick={() => {
            setUploadOpen((v) => !v);
            if (!uploadOpen) setBatchesOpen(false);
          }}
        >
          {uploadOpen ? 'Hide upload' : 'Upload a file'}
        </Button>
        <Button
          type='button'
          size='lg'
          variant={batchesOpen ? 'secondary' : 'outline'}
          onClick={() => {
            setBatchesOpen((v) => !v);
            if (!batchesOpen) setUploadOpen(false);
          }}
        >
          {batchesOpen ? 'Hide uploaded batches' : 'Uploaded batches'}
        </Button>
      </div>

      {uploadOpen && (
      <Card className='min-w-0 overflow-hidden'>
        <CardHeader>
          <CardTitle>Upload a file</CardTitle>
          <CardDescription className='text-base'>
            Choose a CSV or Excel file, match each column to a field, then save. Extra fields you want
            to keep can be labeled as “Extra data.”
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
              <Label htmlFor='vertical'>Product / vertical</Label>
              {settings.verticals.length > 0 ? (
                <select
                  id='vertical'
                  className='border-input bg-background h-11 w-full rounded-md border px-3 text-base'
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
                <p className='text-muted-foreground text-base'>
                  Add product names under Settings first, then come back here.
                </p>
              )}
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='batch-label'>Name for this upload (optional)</Label>
            <Input
              id='batch-label'
              placeholder={`If blank: ${defaultBatchTimestamp()}`}
              value={batchLabel}
              onChange={(e) => setBatchLabel(e.target.value)}
            />
            <p className='text-muted-foreground text-sm'>
              A name helps you find or remove this upload later. Leave blank to use the date and time.
            </p>
          </div>

          {headers.length > 0 && (
            <div className='space-y-3'>
              <div>
                <Label>Match your file columns</Label>
                <p className='text-muted-foreground text-sm'>
                  For each column from your file, pick where it should go. Use Extra data to keep
                  fields that are not on the main list.
                </p>
              </div>
              <div className='max-h-80 space-y-2 overflow-auto rounded-lg border p-3'>
                <div className='text-muted-foreground grid grid-cols-1 gap-2 text-sm font-semibold sm:grid-cols-2'>
                  <span>Column in your file</span>
                  <span>Save as</span>
                </div>
                {headers.map((h) => (
                  <div key={h} className='grid grid-cols-1 items-center gap-2 sm:grid-cols-2'>
                    <div className='min-w-0 rounded-md border bg-muted/40 px-3 py-2.5'>
                      <p className='text-muted-foreground text-xs font-medium'>In your file</p>
                      <p className='truncate text-base font-medium' title={h}>
                        {h}
                      </p>
                    </div>
                    <div className='min-w-0'>
                      <p className='text-muted-foreground mb-1 text-xs font-medium sm:hidden'>
                        Save as
                      </p>
                      <select
                        className='border-input bg-background h-11 w-full rounded-md border px-3 text-base'
                        value={mapping[h] ?? 'attrs'}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [h]: e.target.value as MappedField }))
                        }
                      >
                        <optgroup label='Database'>
                          {mappingOptions
                            .filter((f) => f.group === 'database')
                            .map((f) => (
                              <option key={f.value} value={f.value}>
                                Database · {f.label}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label='Extra data'>
                          {mappingOptions
                            .filter((f) => f.group === 'extra')
                            .map((f) => (
                              <option key={f.value} value={f.value}>
                                Extra data · {f.label}
                              </option>
                            ))}
                        </optgroup>
                        <optgroup label='Skip'>
                          {mappingOptions
                            .filter((f) => f.group === 'skip')
                            .map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <p className='text-muted-foreground text-base'>
                {mapped.records.length} people will be saved
                {mapped.skippedNoPin ? ` · ${mapped.skippedNoPin} skipped (no PIN)` : ''}
                {pendingNewColumns.length
                  ? ` · ${pendingNewColumns.length} extra field(s) will be kept`
                  : ''}
              </p>
            </div>
          )}

          <Button
            type='button'
            size='lg'
            disabled={uploadMutation.isPending || !mapped.records.length || !vertical}
            onClick={() =>
              uploadMutation.mutate({
                records: mapped.records,
                listSource: settings.default_list_source || 'Upload',
                vertical: vertical.trim() || null,
                registerExtraKeys: pendingNewColumns,
                fileName,
                batchLabel: batchLabel.trim() || null
              })
            }
          >
            {uploadMutation.isPending ? 'Saving…' : 'Save to records'}
          </Button>
        </CardContent>
      </Card>
      )}

      {batchesOpen && (
      <Card className='mt-0 min-w-0 overflow-hidden'>
        <CardHeader>
          <CardTitle>Uploaded batches</CardTitle>
          <CardDescription className='text-base'>
            Every file you save is listed here. Open one to view those rows, or remove a whole upload
            if something looks wrong.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className='text-muted-foreground text-base'>No uploads yet. Use “Upload a file” above.</p>
          ) : (
            <div className='max-h-72 space-y-3 overflow-auto'>
              {batches.map((b) => (
                <div
                  key={b.batch_id}
                  className='flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-base font-medium'>{b.label}</p>
                    <p className='text-muted-foreground mt-1 text-sm'>
                      {b.record_count} records
                      {b.vertical ? ` · ${b.vertical}` : ''}
                      {b.list_source ? ` · ${b.list_source}` : ''}
                      {' · '}
                      {new Date(b.created_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <div className='flex shrink-0 flex-wrap gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => {
                        setFilterBatch(String(b.batch_id));
                        setPage(0);
                        setBatchesOpen(false);
                      }}
                    >
                      Show these records
                    </Button>
                    <Button
                      type='button'
                      variant='destructive'
                      onClick={() => setDeleteBatchId(b.batch_id)}
                    >
                      Delete upload
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      <Card className='mt-0 min-w-0 overflow-hidden'>
        <CardHeader className='gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0'>
            <CardTitle>Your records</CardTitle>
            <CardDescription className='text-base'>
              {filtered.length.toLocaleString()} shown
              {recent.length !== filtered.length
                ? ` (filtered from ${recent.length.toLocaleString()})`
                : ''}
            </CardDescription>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Add one person
            </Button>
            {selected.length > 0 && (
              <Button
                type='button'
                variant='destructive'
                onClick={() => setDeleteIds(selected)}
              >
                Delete selected ({selected.length})
              </Button>
            )}
            <DropdownMenu onOpenChange={onColumnMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <Button type='button' variant='outline'>
                Choose columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='max-h-72 w-56'>
              <DropdownMenuLabel>Database</DropdownMenuLabel>
              {coreColumnDefs.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={activeVisible.includes(col.id)}
                  onCheckedChange={(v) => toggleColumn(col.id, v === true)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
              {extraColumnDefs.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Extra data</DropdownMenuLabel>
                  {extraColumnDefs.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={activeVisible.includes(col.id)}
                      onCheckedChange={(v) => toggleColumn(col.id, v === true)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className='min-w-0 space-y-4'>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            <Input
              placeholder='Search by name, address, PIN, phone…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='sm:col-span-2 lg:col-span-1 xl:col-span-2'
            />
            <select
              className='border-input bg-background h-11 min-w-0 rounded-md border px-3 text-base'
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
              aria-label='Filter by upload'
            >
              <option value=''>All uploads</option>
              {batches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.label} ({b.record_count})
                </option>
              ))}
            </select>
            <select
              className='border-input bg-background h-11 min-w-0 rounded-md border px-3 text-base'
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              aria-label='Filter by state'
            >
              <option value=''>All states</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className='border-input bg-background h-11 min-w-0 rounded-md border px-3 text-base'
              value={filterVertical}
              onChange={(e) => setFilterVertical(e.target.value)}
              aria-label='Filter by product'
            >
              <option value=''>All products</option>
              {verticalsInData.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <select
              className='border-input bg-background h-11 min-w-0 rounded-md border px-3 text-base'
              value={filterHomeowner}
              onChange={(e) => setFilterHomeowner(e.target.value)}
              aria-label='Filter by homeowner status'
            >
              <option value=''>Any homeowner status</option>
              {homeownersInData.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className='border-input bg-background h-11 min-w-0 rounded-md border px-3 text-base'
              value={filterPin}
              onChange={(e) => setFilterPin(e.target.value as 'all' | 'with' | 'without')}
              aria-label='Filter by PIN'
            >
              <option value='all'>Any PIN status</option>
              <option value='with'>Has a PIN</option>
              <option value='without'>Missing a PIN</option>
            </select>
            <select
              className='border-input bg-background h-11 min-w-0 rounded-md border px-3 text-base'
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label='Rows per page'
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className='flex flex-wrap items-center gap-3'>
            <Button type='button' variant='outline' onClick={clearFilters}>
              Clear filters
            </Button>
            <p className='text-muted-foreground text-base'>
              Showing {paged.length.toLocaleString()} of {filtered.length.toLocaleString()} people
            </p>
          </div>

          {optionsQuery.isLoading ? (
            <p className='text-muted-foreground text-base'>Loading…</p>
          ) : shownColumns.length === 0 ? (
            <p className='text-muted-foreground text-base'>
              Tap “Choose columns” above to pick which fields to show.
            </p>
          ) : recent.length === 0 ? (
            <p className='text-muted-foreground text-base'>
              No records yet. Tap “Upload a file” at the top.
            </p>
          ) : filtered.length === 0 ? (
            <p className='text-muted-foreground text-base'>
              Nothing matches. Try clearing filters or changing your search.
            </p>
          ) : (
            <>
              <div className='w-full min-w-0 overflow-hidden rounded-md border'>
                <div className='max-h-[min(32rem,60vh)] overflow-auto'>
                  <table className='w-max min-w-full text-left text-base'>
                    <thead className='bg-background sticky top-0 z-10'>
                      <tr className='border-b'>
                        <th className='w-12 px-3 py-3'>
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
                            className='text-muted-foreground px-3 py-3 font-medium whitespace-nowrap'
                          >
                            {c.label}
                          </th>
                        ))}
                        <th className='text-muted-foreground px-3 py-3 font-medium whitespace-nowrap'>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((p) => (
                        <tr key={p.record_id} className='border-b border-border/60 last:border-0'>
                          <td className='px-3 py-3'>
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
                            const value = cellValue(p, c.id, batchLabelById);
                            return (
                              <td
                                key={c.id}
                                className={`px-3 py-3 whitespace-nowrap ${c.id === 'pin' ? 'font-mono' : ''}`}
                              >
                                {value}
                              </td>
                            );
                          })}
                          <td className='px-3 py-3 whitespace-nowrap'>
                            <div className='flex gap-2'>
                              <Button
                                type='button'
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
              <div className='flex flex-wrap items-center justify-between gap-3 text-base'>
                <p className='text-muted-foreground'>
                  {pageSize > 0
                    ? `Page ${safePage + 1} of ${pageCount}`
                    : `Showing all ${paged.length.toLocaleString()} people`}
                </p>
                {pageSize > 0 ? (
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      disabled={safePage <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      Previous page
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      disabled={safePage >= pageCount - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next page
                    </Button>
                  </div>
                ) : null}
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
              This hides the row from the portal and lookup. The data stays in the database and can be
              recovered by an admin.
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
      <AlertDialog
        open={deleteBatchId != null}
        onOpenChange={(open) => !open && setDeleteBatchId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this whole upload?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const batch = batches.find((b) => b.batch_id === deleteBatchId);
                return batch
                  ? `This removes “${batch.label}” and its ${batch.record_count} people from what you see here. An admin can still recover the data if needed.`
                  : 'This removes every person from the selected upload from what you see here. An admin can still recover the data if needed.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeBatch.isPending}
              onClick={() => {
                if (deleteBatchId != null) removeBatch.mutate(deleteBatchId);
              }}
            >
              {removeBatch.isPending ? 'Deleting…' : 'Yes, delete upload'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
