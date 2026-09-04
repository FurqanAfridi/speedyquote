import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRingbaLookupToken } from '@/lib/env.server';
import { digitsOnly } from '@/features/list-management/lib/csv';
import { hasActiveLookupApiKeys, matchStoredLookupToken } from '@/features/list-management/api/keys';
import { getCreativeColumnName } from '@/features/list-management/api/service';

/** Full matched lead — every DB field plus extra columns. */
export type LookupResult = {
  match_method: 'pin' | 'ani' | 'zip' | 'unmatched';
  match_count: number;
  record_id: number | null;
  piece_id: number | null;
  pin: string | null;
  first_name: string | null;
  last_name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  addressState_X: string | null;
  addressZip_X: string | null;
  creative_X: string | null;
  age: number | null;
  age_band: string | null;
  homeowner: string | null;
  known_phone: string | null;
  vertical: string | null;
  list_source: string | null;
  batch_id: number | null;
  attributes: Record<string, string>;
  extra: Record<string, string>;
};

const UNMATCHED: LookupResult = {
  match_method: 'unmatched',
  match_count: 0,
  record_id: null,
  piece_id: null,
  pin: null,
  first_name: null,
  last_name: null,
  address1: null,
  address2: null,
  city: null,
  addressState_X: null,
  addressZip_X: null,
  creative_X: null,
  age: null,
  age_band: null,
  homeowner: null,
  known_phone: null,
  vertical: null,
  list_source: null,
  batch_id: null,
  attributes: {},
  extra: {}
};

function equalTokens(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function hasLookupAuthConfigured(): Promise<boolean> {
  if (getRingbaLookupToken()) return true;
  return hasActiveLookupApiKeys();
}

export async function verifyBearerToken(authorizationHeader: string | null): Promise<boolean> {
  if (!authorizationHeader?.startsWith('Bearer ')) return false;
  const provided = authorizationHeader.slice('Bearer '.length).trim();
  if (!provided) return false;

  const expected = getRingbaLookupToken();
  if (expected && equalTokens(provided, expected)) return true;

  try {
    return await matchStoredLookupToken(provided);
  } catch {
    return false;
  }
}

type RecordRow = {
  record_id: number;
  first_name: string | null;
  last_name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  addressState_X: string | null;
  addressZip_X: string | null;
  creative_X?: string | null;
  creative_x?: string | null;
  age: number | null;
  age_band: string | null;
  homeowner: string | null;
  known_phone: string | null;
  vertical: string | null;
  list_source: string | null;
  batch_id: number | null;
  attrs: Record<string, unknown> | null;
};

const RECORD_SELECT_BASE =
  'record_id, first_name, last_name, address1, address2, city, addressState_X, addressZip_X, age, age_band, homeowner, known_phone, vertical, list_source, batch_id, attrs';

async function recordSelect() {
  const creativeCol = await getCreativeColumnName();
  return `${RECORD_SELECT_BASE.replace('addressZip_X,', `addressZip_X, ${creativeCol},`)}`;
}

async function pieceForRecord(recordId: number) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('mail_pieces')
    .select('piece_id, pin_code, record_id')
    .eq('record_id', recordId)
    .is('deleted_at', null)
    .order('piece_id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function toResult(
  rec: RecordRow,
  piece: { piece_id: number; pin_code: string } | null,
  method: LookupResult['match_method'],
  matchCount: number
): LookupResult {
  const attributes = stringifyAttrs(rec.attrs);
  return {
    match_method: method,
    match_count: matchCount,
    record_id: rec.record_id,
    piece_id: piece?.piece_id ?? null,
    pin: piece?.pin_code ?? null,
    first_name: rec.first_name,
    last_name: rec.last_name,
    address1: rec.address1,
    address2: rec.address2,
    city: rec.city,
    addressState_X: rec.addressState_X,
    addressZip_X: rec.addressZip_X,
    creative_X: rec.creative_X ?? rec.creative_x ?? null,
    age: rec.age,
    age_band: rec.age_band,
    homeowner: rec.homeowner,
    known_phone: rec.known_phone,
    vertical: rec.vertical,
    list_source: rec.list_source,
    batch_id: rec.batch_id,
    attributes,
    extra: attributes
  };
}

function stringifyAttrs(attrs: Record<string, unknown> | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attrs) return out;
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

function leadColumnError(message: string) {
  if (/column .*records\.(addressState_X|addressZip_X|creative_X|creative_x)/i.test(message)) {
    return new Error(
      `${message} — If you already ran migration 700, also run 20260904080000_fix_creative_x_case.sql`
    );
  }
  return new Error(message);
}

export async function lookupAttributes(input: {
  pin?: unknown;
  zip?: unknown;
  caller_id?: unknown;
  call_id?: string | null;
}): Promise<{ body: LookupResult; latencyMs: number }> {
  const pinRaw = String(input.pin ?? '').trim();
  const pinDigits = digitsOnly(input.pin);
  const zip = digitsOnly(input.zip).slice(0, 5);
  const ani = digitsOnly(input.caller_id);
  const started = performance.now();
  let body: LookupResult = { ...UNMATCHED };
  let errorMessage: string | null = null;
  let logKey = pinRaw || zip || ani || null;
  let method: LookupResult['match_method'] = 'unmatched';

  try {
    const admin = createAdminClient();
    const RECORD_SELECT = await recordSelect();

    if (pinRaw || pinDigits) {
      method = 'pin';
      logKey = pinRaw || pinDigits;
      const codes = [...new Set([pinRaw, pinDigits].filter(Boolean))];
      const { data: pieces, error } = await admin
        .from('mail_pieces')
        .select('piece_id, pin_code, record_id')
        .in('pin_code', codes)
        .is('deleted_at', null)
        .limit(5);
      if (error) throw new Error(error.message);
      if (pieces?.length) {
        const { data: rec, error: recError } = await admin
          .from('records')
          .select(RECORD_SELECT)
          .eq('record_id', pieces[0].record_id)
          .is('deleted_at', null)
          .maybeSingle();
        if (recError) throw leadColumnError(recError.message);
        if (rec) body = toResult(rec as RecordRow, pieces[0], 'pin', pieces.length);
      }
    } else if (ani) {
      method = 'ani';
      logKey = ani;
      const last10 = ani.slice(-10);
      const { data: recs, error } = await admin
        .from('records')
        .select(RECORD_SELECT)
        .ilike('known_phone', `%${last10}%`)
        .is('deleted_at', null)
        .limit(20);
      if (error) throw leadColumnError(error.message);
      const matched = (recs ?? []).filter((r) =>
        digitsOnly(r.known_phone).endsWith(last10)
      ) as RecordRow[];
      if (matched[0]) {
        const piece = await pieceForRecord(matched[0].record_id);
        body = toResult(matched[0], piece, 'ani', matched.length);
      }
    } else if (zip) {
      method = 'zip';
      logKey = zip;
      const { data: recs, error } = await admin
        .from('records')
        .select(RECORD_SELECT)
        .eq('addressZip_X', zip)
        .is('deleted_at', null)
        .limit(20);
      if (error) throw leadColumnError(error.message);
      const matched = (recs ?? []) as RecordRow[];
      if (matched[0]) {
        const piece = await pieceForRecord(matched[0].record_id);
        body = toResult(matched[0], piece, 'zip', matched.length);
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'lookup_failed';
    body = { ...UNMATCHED };
  }

  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  void writeLookupLog({
    pin: logKey,
    hit: body.match_method !== 'unmatched',
    latencyMs,
    error: errorMessage,
    callId: input.call_id ?? method
  });

  return { body, latencyMs };
}

async function writeLookupLog(entry: {
  pin: string | null;
  hit: boolean;
  latencyMs: number;
  error: string | null;
  callId: string | null;
}) {
  try {
    const admin = createAdminClient();
    await admin.from('lookup_logs').insert({
      pin: entry.pin,
      hit: entry.hit,
      latency_ms: entry.latencyMs,
      error: entry.error,
      call_id: entry.callId
    });
  } catch {
    // never block Ringba
  }
}
