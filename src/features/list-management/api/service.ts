import { createAdminClient } from '@/lib/supabase/admin';
import { ageBandFromAge } from '../lib/csv';
import { attrColumnId, defaultBatchTimestamp, slugifyColumnKey } from '../lib/columns';
import type {
  ListRecordInput,
  PortalSettings,
  RecordMutationInput,
  UploadBatch,
  UploadListInput,
  UploadListResult,
  UploadedPiece
} from './types';
import { DEFAULT_PORTAL_SETTINGS } from './types';

const RESERVED_COLUMN_KEYS = new Set([
  'pin',
  'first_name',
  'last_name',
  'address1',
  'address2',
  'city',
  'state',
  'zip',
  'zip4',
  'age',
  'age_band',
  'homeowner_status',
  'known_phone',
  'list_source',
  'vertical',
  'attrs',
  'record_id',
  'name',
  'phone',
  'homeowner',
  'ignore'
]);

function normalizeExtraColumnKey(raw: string) {
  const key = slugifyColumnKey(raw);
  if (!key || !/^[a-z][a-z0-9_]*$/.test(key)) {
    throw new Error('Column names must start with a letter and use only letters, numbers, and underscores');
  }
  if (RESERVED_COLUMN_KEYS.has(key)) {
    throw new Error(`“${key}” is a built-in database column`);
  }
  return key;
}

function asAttrs(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || v === '') continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

function toStored(row: {
  record_id: number;
  batch_id?: number | null;
  first_name: string | null;
  last_name: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  zip4: string | null;
  age: number | null;
  homeowner_status: string | null;
  known_phone: string | null;
  vertical: string | null;
  list_source: string | null;
  created_at?: string | null;
  attrs: unknown;
  mail_pieces?: Array<{
    piece_id: number;
    pin_code: string;
    deleted_at?: string | null;
  }> | { piece_id: number; pin_code: string; deleted_at?: string | null } | null;
}): UploadedPiece {
  const pieces = (
    Array.isArray(row.mail_pieces) ? row.mail_pieces : row.mail_pieces ? [row.mail_pieces] : []
  ).filter((p) => !p.deleted_at);
  const piece = pieces[0];
  return {
    piece_id: piece?.piece_id ?? null,
    record_id: row.record_id,
    batch_id: row.batch_id ?? null,
    pin_code: piece?.pin_code ?? null,
    first_name: row.first_name,
    last_name: row.last_name,
    address1: row.address1,
    city: row.city,
    state: row.state,
    zip: row.zip,
    zip4: row.zip4,
    age: row.age,
    homeowner_status: row.homeowner_status,
    known_phone: row.known_phone,
    vertical: row.vertical,
    list_source: row.list_source,
    created_at: row.created_at ?? null,
    attrs: asAttrs(row.attrs)
  };
}

function batchError(message: string) {
  if (message.includes('upload_batches') || message.includes('batch_id')) {
    return new Error('Run supabase/migrations/20260904020000_upload_batches.sql in Supabase first');
  }
  return new Error(message);
}

function softDeleteError(message: string) {
  if (message.includes('deleted_at')) {
    return new Error('Run supabase/migrations/20260904040000_soft_delete.sql in Supabase first');
  }
  return new Error(message);
}

function nowIso() {
  return new Date().toISOString();
}

function toBatch(row: Record<string, unknown>): UploadBatch {
  return {
    batch_id: Number(row.batch_id),
    label: String(row.label ?? 'Upload'),
    file_name: (row.file_name as string | null) ?? null,
    list_source: (row.list_source as string | null) ?? null,
    vertical: (row.vertical as string | null) ?? null,
    record_count: Number(row.record_count ?? 0),
    created_at: String(row.created_at ?? new Date().toISOString())
  };
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

function parseSettings(row: Record<string, unknown> | null): PortalSettings {
  if (!row) return { ...DEFAULT_PORTAL_SETTINGS };
  const verticalsRaw = row.verticals;
  const extraRaw = row.extra_columns;
  return {
    org_name: typeof row.org_name === 'string' && row.org_name.trim() ? row.org_name.trim() : DEFAULT_PORTAL_SETTINGS.org_name,
    default_list_source:
      typeof row.default_list_source === 'string' && row.default_list_source.trim()
        ? row.default_list_source.trim()
        : DEFAULT_PORTAL_SETTINGS.default_list_source,
    verticals: Array.isArray(verticalsRaw)
      ? verticalsRaw
          .map((v) => {
            if (typeof v === 'string') return { name: v.trim() };
            if (v && typeof v === 'object' && 'name' in v && typeof (v as { name: unknown }).name === 'string') {
              return { name: (v as { name: string }).name.trim() };
            }
            return { name: '' };
          })
          .filter((v) => v.name)
      : [],
    extra_columns: Array.isArray(extraRaw)
      ? extraRaw
          .map((c) => {
            if (!c || typeof c !== 'object') return null;
            const key = String((c as { key?: unknown }).key ?? '').trim();
            if (!key) return null;
            return {
              key,
              default_value: String((c as { default_value?: unknown }).default_value ?? '')
            };
          })
          .filter((c): c is { key: string; default_value: string } => Boolean(c))
      : [],
    visible_columns: asStringArray(row.visible_columns)
  };
}

function settingsError(message: string) {
  if (message.includes('portal_settings') || message.includes('does not exist')) {
    return new Error('Run supabase/migrations/20260903240000_portal_settings.sql in Supabase first');
  }
  return new Error(message);
}

export async function getPortalSettings(): Promise<PortalSettings> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('portal_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw settingsError(error.message);
  if (!data) {
    const { error: insertError } = await admin.from('portal_settings').insert({ id: 1 });
    if (insertError && !insertError.message.includes('duplicate')) throw settingsError(insertError.message);
    return { ...DEFAULT_PORTAL_SETTINGS };
  }
  return parseSettings(data as Record<string, unknown>);
}

export async function savePortalSettings(input: PortalSettings): Promise<PortalSettings> {
  const next: PortalSettings = {
    org_name: input.org_name.trim() || DEFAULT_PORTAL_SETTINGS.org_name,
    default_list_source: input.default_list_source.trim() || DEFAULT_PORTAL_SETTINGS.default_list_source,
    verticals: input.verticals
      .map((v) => ({ name: v.name.trim() }))
      .filter((v, i, arr) => v.name && arr.findIndex((x) => x.name.toLowerCase() === v.name.toLowerCase()) === i),
    extra_columns: input.extra_columns
      .map((c) => ({ key: c.key.trim(), default_value: c.default_value }))
      .filter((c, i, arr) => c.key && arr.findIndex((x) => x.key === c.key) === i),
    visible_columns: input.visible_columns.filter(Boolean)
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('portal_settings')
    .upsert({
      id: 1,
      ...next,
      updated_at: new Date().toISOString()
    })
    .select('*')
    .single();

  if (error) throw settingsError(error.message);
  return parseSettings(data as Record<string, unknown>);
}

/** Create a custom column in portal_settings (+ seed records.attrs). */
export async function createExtraColumn(input: {
  key: string;
  default_value?: string;
}): Promise<PortalSettings> {
  const key = normalizeExtraColumnKey(input.key);
  const default_value = input.default_value?.trim() ?? '';
  const admin = createAdminClient();

  const { data: rpcCols, error: rpcError } = await admin.rpc('register_record_extra_column', {
    p_key: key,
    p_default: default_value
  });

  if (!rpcError && rpcCols != null) {
    return getPortalSettings();
  }

  // Fallback when the SQL function has not been applied yet.
  if (rpcError && !/does not exist|function/i.test(rpcError.message)) {
    throw settingsError(rpcError.message);
  }

  const settings = await getPortalSettings();
  if (settings.extra_columns.some((c) => c.key === key)) {
    throw new Error(`Column “${key}” already exists`);
  }

  // Do not auto-add to visible_columns — extras stay hidden until the user enables them.
  const saved = await savePortalSettings({
    ...settings,
    extra_columns: [...settings.extra_columns, { key, default_value }]
  });

  // Seed attrs on existing rows so the column is present in the database.
  const { data: rows, error: listError } = await admin
    .from('records')
    .select('record_id, attrs')
    .is('deleted_at', null)
    .limit(10000);
  if (listError) throw new Error(listError.message);

  for (const row of rows ?? []) {
    const raw =
      row.attrs && typeof row.attrs === 'object' && !Array.isArray(row.attrs)
        ? { ...(row.attrs as Record<string, unknown>) }
        : {};
    if (Object.prototype.hasOwnProperty.call(raw, key) && String(raw[key] ?? '') !== '') continue;
    if (Object.prototype.hasOwnProperty.call(raw, key) && !default_value) continue;
    raw[key] = default_value;
    const { error: updError } = await admin
      .from('records')
      .update({ attrs: raw, updated_at: new Date().toISOString() })
      .eq('record_id', row.record_id);
    if (updError) throw new Error(updError.message);
  }

  return saved;
}

export async function deleteExtraColumn(keyRaw: string): Promise<PortalSettings> {
  const key = slugifyColumnKey(keyRaw) || keyRaw.trim();
  if (!key) throw new Error('Column key required');
  const settings = await getPortalSettings();
  const next: PortalSettings = {
    ...settings,
    extra_columns: settings.extra_columns.filter((c) => c.key !== key),
    visible_columns: settings.visible_columns.filter((id) => id !== attrColumnId(key))
  };
  return savePortalSettings(next);
}

function countBy(values: Array<string | null | undefined>) {
  const map = new Map<string, number>();
  for (const v of values) {
    const key = (v && v.trim()) || 'Unset';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export async function uploadList(input: UploadListInput): Promise<UploadListResult> {
  if (!input.records?.length) throw new Error('No rows to upload');
  if (input.records.length > 5000) throw new Error('Max 5,000 rows per upload');

  const admin = createAdminClient();
  let skippedNoPin = 0;

  let settings: Awaited<ReturnType<typeof getPortalSettings>> | null = null;
  try {
    settings = await getPortalSettings();
  } catch {
    settings = null;
  }
  let extraColumns = settings?.extra_columns ?? [];

  const registerKeys = [
    ...new Set([
      ...(input.registerExtraKeys ?? []),
      ...input.records.flatMap((r) => Object.keys(r.attrs ?? {}))
    ])
  ].filter(Boolean);
  const have = new Set(extraColumns.map((c) => c.key));
  for (const key of registerKeys) {
    if (have.has(key)) continue;
    try {
      settings = await createExtraColumn({ key, default_value: '' });
      extraColumns = settings.extra_columns;
      have.add(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (/already exists/i.test(message) || /built-in/i.test(message)) {
        have.add(key);
        continue;
      }
      if (!settings) throw err;
    }
  }
  if (settings) {
    extraColumns = settings.extra_columns;
  }

  const listSource = input.listSource?.trim() || 'Upload';
  const vertical = input.vertical?.trim() || null;
  const fileName = input.fileName?.trim() || null;
  const batchLabel = input.batchLabel?.trim() || defaultBatchTimestamp();

  const { data: batchRow, error: batchErrorInsert } = await admin
    .from('upload_batches')
    .insert({
      label: batchLabel,
      file_name: fileName,
      list_source: listSource,
      vertical,
      record_count: 0
    })
    .select('*')
    .single();

  if (batchErrorInsert || !batchRow) {
    throw batchError(batchErrorInsert?.message ?? 'Failed to create upload batch');
  }
  const batchId = batchRow.batch_id as number;

  const prepared = input.records.map((row: ListRecordInput) => {
    if (!row.pin) skippedNoPin += 1;
    const attrs = { ...(row.attrs ?? {}) };
    for (const col of extraColumns) {
      if ((attrs[col.key] == null || attrs[col.key] === '') && col.default_value) {
        attrs[col.key] = col.default_value;
      }
    }
    return {
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      address1: row.address1 ?? null,
      address2: row.address2 ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      zip: row.zip ?? null,
      zip4: row.zip4 ?? null,
      age: row.age ?? null,
      age_band: ageBandFromAge(row.age),
      homeowner_status: row.homeowner_status ?? null,
      known_phone: row.known_phone ?? null,
      list_source: row.list_source ?? listSource,
      list_purchase_date: new Date().toISOString().slice(0, 10),
      vertical: row.vertical ?? vertical,
      batch_id: batchId,
      attrs
    };
  });

  const { data: inserted, error: insertError } = await admin
    .from('records')
    .insert(prepared)
    .select(
      'record_id, batch_id, first_name, last_name, address1, city, state, zip, zip4, age, homeowner_status, known_phone, vertical, list_source, created_at, attrs'
    );

  if (insertError || !inserted) {
    await admin.from('upload_batches').delete().eq('batch_id', batchId);
    throw new Error(
      insertError?.message?.includes('batch_id')
        ? 'Run supabase/migrations/20260904020000_upload_batches.sql in Supabase first'
        : insertError?.message?.includes('attrs') || insertError?.message?.includes('vertical')
          ? 'Run supabase/migrations/20260903230000_any_vertical.sql in Supabase first'
          : (insertError?.message ?? 'Failed to insert records')
    );
  }

  await admin
    .from('upload_batches')
    .update({ record_count: inserted.length })
    .eq('batch_id', batchId);

  const pieces = inserted
    .map((rec, i) => ({
      record_id: rec.record_id as number,
      pin_code: input.records[i].pin
    }))
    .filter((p) => p.pin_code);

  let pieceRows: Array<{ piece_id: number; record_id: number; pin_code: string }> = [];
  if (pieces.length) {
    const { data, error: pieceError } = await admin
      .from('mail_pieces')
      .insert(pieces)
      .select('piece_id, record_id, pin_code');

    if (pieceError) {
      throw new Error(
        pieceError.message.includes('duplicate') || pieceError.message.includes('unique')
          ? 'A PIN in this file already exists. Remove duplicates and try again.'
          : pieceError.message.includes('null value') || pieceError.message.includes('drop_id')
            ? 'Run supabase/migrations/20260903220000_simplify_schema.sql in Supabase first'
            : pieceError.message
      );
    }
    pieceRows = (data ?? []) as typeof pieceRows;
  }

  const byRecord = new Map(inserted.map((r) => [r.record_id as number, r]));
  const samplePieces: UploadedPiece[] = pieceRows.slice(0, 25).map((p) => {
    const rec = byRecord.get(p.record_id)!;
    return toStored({ ...rec, mail_pieces: p } as Parameters<typeof toStored>[0]);
  });

  return {
    recordsInserted: inserted.length,
    piecesCreated: pieceRows.length,
    skippedNoPin,
    samplePieces,
    batch: toBatch({ ...batchRow, record_count: inserted.length })
  };
}

export async function listUploadBatches(limit = 100): Promise<UploadBatch[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('upload_batches')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw batchError(error.message);
  return (data ?? []).map((row) => toBatch(row as Record<string, unknown>));
}

export async function deleteUploadBatch(batchId: number): Promise<{ deleted: number }> {
  if (!Number.isFinite(batchId)) throw new Error('Invalid batch');
  const admin = createAdminClient();
  const deletedAt = nowIso();

  const recordIds: number[] = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await admin
      .from('records')
      .select('record_id')
      .eq('batch_id', batchId)
      .is('deleted_at', null)
      .range(from, from + pageSize - 1);
    if (error) throw softDeleteError(error.message);
    const rows = data ?? [];
    for (const row of rows) recordIds.push(row.record_id as number);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  for (let i = 0; i < recordIds.length; i += 500) {
    const chunk = recordIds.slice(i, i + 500);
    const { error: pieceError } = await admin
      .from('mail_pieces')
      .update({ deleted_at: deletedAt })
      .in('record_id', chunk)
      .is('deleted_at', null);
    if (pieceError) throw softDeleteError(pieceError.message);
    const { error: recError } = await admin
      .from('records')
      .update({ deleted_at: deletedAt, updated_at: deletedAt })
      .in('record_id', chunk)
      .is('deleted_at', null);
    if (recError) throw softDeleteError(recError.message);
  }

  const { error: batchDelError } = await admin
    .from('upload_batches')
    .update({ deleted_at: deletedAt })
    .eq('batch_id', batchId)
    .is('deleted_at', null);
  if (batchDelError) throw softDeleteError(batchDelError.message);

  return { deleted: recordIds.length };
}

export async function listRecords(limit = Number.POSITIVE_INFINITY): Promise<UploadedPiece[]> {
  const admin = createAdminClient();
  const pageSize = 1000;
  const out: UploadedPiece[] = [];
  let from = 0;

  while (out.length < limit) {
    const take = Math.min(pageSize, Number.isFinite(limit) ? limit - out.length : pageSize);
    const to = from + take - 1;
    const { data, error } = await admin
      .from('records')
      .select(
        `
      record_id,
      batch_id,
      first_name,
      last_name,
      address1,
      city,
      state,
      zip,
      zip4,
      age,
      homeowner_status,
      known_phone,
      vertical,
      list_source,
      created_at,
      attrs,
      mail_pieces ( piece_id, pin_code, deleted_at )
    `
      )
      .is('deleted_at', null)
      .order('record_id', { ascending: false })
      .range(from, to);

    if (error) {
      if (error.message.includes('batch_id')) {
        throw batchError(error.message);
      }
      if (error.message.includes('deleted_at')) {
        throw softDeleteError(error.message);
      }
      throw new Error(error.message);
    }
    const batch = (data ?? []).map((row) => toStored(row as Parameters<typeof toStored>[0]));
    out.push(...batch);
    if (batch.length < take) break;
    from += take;
  }

  return out;
}

function pinError(message: string) {
  if (message.includes('duplicate') || message.includes('unique')) {
    return new Error('That PIN already exists on another record.');
  }
  return new Error(message);
}

export async function updateRecord(input: RecordMutationInput): Promise<void> {
  if (!input.record_id) throw new Error('Missing record id');
  const pin = (input.pin ?? '').trim();
  const admin = createAdminClient();

  const { error } = await admin
    .from('records')
    .update({
      first_name: input.first_name ?? null,
      last_name: input.last_name ?? null,
      address1: input.address1 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      zip4: input.zip4 ?? null,
      age: input.age ?? null,
      age_band: ageBandFromAge(input.age),
      homeowner_status: input.homeowner_status ?? null,
      known_phone: input.known_phone ?? null,
      list_source: input.list_source ?? null,
      vertical: input.vertical ?? null,
      attrs: input.attrs ?? {},
      updated_at: new Date().toISOString()
    })
    .eq('record_id', input.record_id);

  if (error) throw new Error(error.message);

  const { data: pieces, error: pieceReadError } = await admin
    .from('mail_pieces')
    .select('piece_id, pin_code')
    .eq('record_id', input.record_id)
    .is('deleted_at', null)
    .order('piece_id', { ascending: false });

  if (pieceReadError) throw new Error(pieceReadError.message);
  const current = pieces?.[0];

  if (!pin) {
    const { error: delError } = await admin
      .from('mail_pieces')
      .update({ deleted_at: nowIso() })
      .eq('record_id', input.record_id)
      .is('deleted_at', null);
    if (delError) throw softDeleteError(delError.message);
    return;
  }

  if (current) {
    if (current.pin_code !== pin) {
      const { error: updError } = await admin
        .from('mail_pieces')
        .update({ pin_code: pin })
        .eq('piece_id', current.piece_id);
      if (updError) throw pinError(updError.message);
    }
    return;
  }

  const { error: insError } = await admin.from('mail_pieces').insert({
    record_id: input.record_id,
    pin_code: pin
  });
  if (insError) throw pinError(insError.message);
}

export async function deleteRecords(recordIds: number[]): Promise<number> {
  const ids = [...new Set(recordIds.filter((id) => Number.isFinite(id)))];
  if (!ids.length) throw new Error('No records selected');
  if (ids.length > 500) throw new Error('Delete at most 500 records at a time');

  const admin = createAdminClient();
  const deletedAt = nowIso();

  const { error: pieceError } = await admin
    .from('mail_pieces')
    .update({ deleted_at: deletedAt })
    .in('record_id', ids)
    .is('deleted_at', null);
  if (pieceError) throw softDeleteError(pieceError.message);

  const { data, error } = await admin
    .from('records')
    .update({ deleted_at: deletedAt, updated_at: deletedAt })
    .in('record_id', ids)
    .is('deleted_at', null)
    .select('record_id');
  if (error) throw softDeleteError(error.message);
  return data?.length ?? ids.length;
}

export type LookupLogRow = {
  request_id: number;
  timestamp: string;
  pin: string | null;
  hit: boolean;
  latency_ms: number | null;
  error: string | null;
  call_id: string | null;
};

export async function listLookupLogs(limit = 50): Promise<LookupLogRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lookup_logs')
    .select('request_id, timestamp, pin, hit, latency_ms, error, call_id')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as LookupLogRow[];
}

export async function getOverviewStats() {
  const admin = createAdminClient();
  const [records, pieces, lookups, hits, recent, recRows, logRows] = await Promise.all([
    admin.from('records').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    admin
      .from('mail_pieces')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),
    admin.from('lookup_logs').select('*', { count: 'exact', head: true }),
    admin.from('lookup_logs').select('*', { count: 'exact', head: true }).eq('hit', true),
    listLookupLogs(12),
    admin
      .from('records')
      .select('vertical, state, list_source, created_at, homeowner_status, known_phone')
      .is('deleted_at', null)
      .order('record_id', { ascending: false })
      .limit(8000),
    admin.from('lookup_logs').select('hit, call_id, timestamp, latency_ms').order('timestamp', { ascending: false }).limit(500)
  ]);

  if (records.error) throw new Error(records.error.message);
  if (pieces.error) throw new Error(pieces.error.message);
  if (lookups.error) throw new Error(lookups.error.message);
  if (hits.error) throw new Error(hits.error.message);
  if (recRows.error) throw new Error(recRows.error.message);
  if (logRows.error) throw new Error(logRows.error.message);

  const recs = recRows.data ?? [];
  const logs = logRows.data ?? [];
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const logs24h = logs.filter((l) => new Date(l.timestamp as string).getTime() >= dayAgo);
  const recs7d = recs.filter((r) => r.created_at && new Date(r.created_at as string).getTime() >= weekAgo);
  const withPhone = recs.filter((r) => r.known_phone).length;
  const missingPin = Math.max(0, (records.count ?? 0) - (pieces.count ?? 0));
  const latencies = logs.map((l) => l.latency_ms).filter((n): n is number => typeof n === 'number');
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  return {
    recordCount: records.count ?? 0,
    pinCount: pieces.count ?? 0,
    lookupCount: lookups.count ?? 0,
    hitCount: hits.count ?? 0,
    recordsLast7Days: recs7d.length,
    withPhoneCount: withPhone,
    missingPinCount: missingPin,
    lookupsLast24h: logs24h.length,
    hitsLast24h: logs24h.filter((l) => l.hit).length,
    uniqueStates: new Set(recs.map((r) => r.state).filter(Boolean)).size,
    uniqueVerticals: new Set(recs.map((r) => r.vertical).filter(Boolean)).size,
    avgLatencyMs: avgLatency,
    byVertical: countBy(recs.map((r) => r.vertical as string | null)),
    byState: countBy(recs.map((r) => r.state as string | null)).slice(0, 12),
    byListSource: countBy(recs.map((r) => r.list_source as string | null)),
    byHomeowner: countBy(recs.map((r) => r.homeowner_status as string | null)),
    byLookupMethod: countBy(logs.map((l) => (l.call_id as string | null) ?? 'unknown')),
    recentLogs: recent
  };
}
