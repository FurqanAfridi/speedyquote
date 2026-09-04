import type { ColumnMapping, ListRecordInput, MappedField, PortalExtraColumn } from '../api/types';
import { attrColumnId, slugifyColumnKey } from './columns';

/** Every database field clients can map a file column onto. */
export const DATABASE_FIELDS: {
  value: Exclude<MappedField, 'attrs' | 'ignore'>;
  label: string;
  hint: string;
}[] = [
  { value: 'pin', label: 'PIN', hint: 'mail_pieces.pin_code · lookup key' },
  { value: 'first_name', label: 'First name', hint: 'records.first_name' },
  { value: 'last_name', label: 'Last name', hint: 'records.last_name' },
  { value: 'address1', label: 'Address', hint: 'records.address1' },
  { value: 'address2', label: 'Address 2', hint: 'records.address2' },
  { value: 'city', label: 'City', hint: 'records.city' },
  { value: 'addressState_X', label: 'addressState_X', hint: 'records.addressState_X' },
  { value: 'addressZip_X', label: 'addressZip_X', hint: 'records.addressZip_X · lookup' },
  { value: 'creative_X', label: 'creative_X', hint: 'records.creative_X' },
  { value: 'age', label: 'age', hint: 'records.age' },
  { value: 'homeowner', label: 'homeowner', hint: 'records.homeowner' },
  { value: 'known_phone', label: 'Phone / ANI', hint: 'records.known_phone · lookup' },
  { value: 'vertical', label: 'Vertical', hint: 'records.vertical' }
];

/** @deprecated use getMappingOptions — kept for any old imports */
export const FIELD_LABELS = [
  ...DATABASE_FIELDS.map((f) => ({
    value: f.value as MappedField,
    label: `${f.label} (${f.hint.split(' · ')[0]})`
  })),
  { value: 'attrs' as MappedField, label: 'Extra data (keep from upload)' },
  { value: 'ignore' as MappedField, label: 'Skip' }
];

export type MappingOption = { value: string; label: string; group: 'database' | 'extra' | 'skip' };

export function getMappingOptions(extraColumns: PortalExtraColumn[]): MappingOption[] {
  const core: MappingOption[] = DATABASE_FIELDS.map((f) => ({
    value: f.value,
    label: f.label,
    group: 'database'
  }));
  const extras: MappingOption[] = extraColumns.map((c) => ({
    value: attrColumnId(c.key),
    label: c.key,
    group: 'extra'
  }));
  return [
    ...core,
    ...extras,
    {
      value: 'attrs',
      label: 'Keep as extra data (use uploaded column name)',
      group: 'extra'
    },
    { value: 'ignore', label: 'Do not import', group: 'skip' }
  ];
}

const HEADER_TO_FIELD: Record<string, MappedField> = {
  pin: 'pin',
  pin_code: 'pin',
  pincode: 'pin',
  key_code: 'pin',
  keycode: 'pin',
  first_name: 'first_name',
  firstname: 'first_name',
  name_first: 'first_name',
  first: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  name_last: 'last_name',
  last: 'last_name',
  address1: 'address1',
  address: 'address1',
  street: 'address1',
  address2: 'address2',
  city: 'city',
  state: 'addressState_X',
  st: 'addressState_X',
  address_state: 'addressState_X',
  addressstate: 'addressState_X',
  zip: 'addressZip_X',
  zipcode: 'addressZip_X',
  zip_code: 'addressZip_X',
  postal: 'addressZip_X',
  postal_code: 'addressZip_X',
  address_zip: 'addressZip_X',
  addresszip: 'addressZip_X',
  addressstate_x: 'addressState_X',
  addresszip_x: 'addressZip_X',
  creative: 'creative_X',
  creative_x: 'creative_X',
  age: 'age',
  homeowner_status: 'homeowner',
  homeowner: 'homeowner',
  homeownerprobabilitymodel: 'homeowner',
  homeowner_probability_model: 'homeowner',
  known_phone: 'known_phone',
  phone: 'known_phone',
  phonenumber: 'known_phone',
  phone_number: 'known_phone',
  caller_id: 'known_phone',
  ani: 'known_phone',
  vertical: 'vertical'
};

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseDelimited(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.every((c) => !c)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? '';
    });
    rows.push(row);
  }
  return { headers, rows };
}

export function guessMapping(headers: string[], extraColumns: PortalExtraColumn[] = []): ColumnMapping {
  const mapping: ColumnMapping = {};
  const extraByNorm = new Map(extraColumns.map((c) => [normalizeHeader(c.key), c.key]));
  for (const h of headers) {
    const norm = normalizeHeader(h);
    const core = HEADER_TO_FIELD[norm];
    if (core) {
      mapping[h] = core;
      continue;
    }
    const extraKey = extraByNorm.get(norm) ?? (extraColumns.some((c) => c.key === h) ? h : null);
    if (extraKey) {
      mapping[h] = attrColumnId(extraKey);
      continue;
    }
    mapping[h] = 'attrs';
  }
  return mapping;
}

function parseHomeowner(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith('own') || v === 'o' || v === 'y' || v === 'yes' || v === 'h') return 'owner';
  if (v.startsWith('rent') || v === 'r' || v === 'n' || v === 'no') return 'renter';
  return value.trim();
}

function isAttrTarget(field: string): field is `attr:${string}` | 'attrs' {
  return field === 'attrs' || field.startsWith('attr:');
}

function attrKeyFromTarget(header: string, field: string): string {
  if (field.startsWith('attr:')) {
    const key = field.slice(5).trim();
    return key || slugifyColumnKey(header) || header;
  }
  return slugifyColumnKey(header) || header.trim();
}

/** Attr keys that should be registered as portal extra columns after this mapping. */
export function collectNewExtraKeys(mapping: ColumnMapping, existing: PortalExtraColumn[]): string[] {
  const have = new Set(existing.map((c) => c.key));
  const keys = new Set<string>();
  for (const [header, field] of Object.entries(mapping)) {
    if (!isAttrTarget(field) || field === 'ignore') continue;
    const key = attrKeyFromTarget(header, field);
    if (key && !have.has(key)) keys.add(key);
  }
  return [...keys];
}

export function applyMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): { records: ListRecordInput[]; skippedNoPin: number; newExtraKeys: string[] } {
  const records: ListRecordInput[] = [];
  let skippedNoPin = 0;
  const newExtraKeys = new Set<string>();

  for (const [header, field] of Object.entries(mapping)) {
    if (field === 'ignore') continue;
    if (!isAttrTarget(field)) continue;
    newExtraKeys.add(attrKeyFromTarget(header, field));
  }

  for (const row of rows) {
    const get = (field: MappedField) => {
      const header = Object.keys(mapping).find((h) => mapping[h] === field);
      return header ? row[header]?.trim() : undefined;
    };

    const pin = (get('pin') ?? '').replace(/\s+/g, '');
    if (!pin) skippedNoPin += 1;

    const ageRaw = get('age');
    const parsedAge = ageRaw ? Number.parseInt(ageRaw, 10) : null;
    const age = parsedAge != null && Number.isFinite(parsedAge) ? parsedAge : null;
    const zipDigits = (get('addressZip_X') ?? '').replace(/\D/g, '');

    const attrs: Record<string, string> = {};
    for (const [header, field] of Object.entries(mapping)) {
      if (field === 'ignore') continue;
      if (!isAttrTarget(field)) continue;
      const key = attrKeyFromTarget(header, field);
      const v = row[header]?.trim();
      if (v) attrs[key] = v;
    }
    if (ageRaw && age == null) attrs.age = ageRaw;

    records.push({
      pin,
      first_name: get('first_name') || null,
      last_name: get('last_name') || null,
      address1: get('address1') || null,
      address2: get('address2') || null,
      city: get('city') || null,
      addressState_X: get('addressState_X') || null,
      addressZip_X: zipDigits.slice(0, 5) || get('addressZip_X') || null,
      creative_X: get('creative_X') || null,
      age,
      homeowner: parseHomeowner(get('homeowner')),
      known_phone: get('known_phone') || null,
      list_source: get('list_source') || null,
      vertical: get('vertical') || null,
      attrs
    });
  }

  return { records, skippedNoPin, newExtraKeys: [...newExtraKeys] };
}

export function ageBandFromAge(age: number | null | undefined): string | null {
  if (age == null || !Number.isFinite(age)) return null;
  if (age < 55) return 'under-55';
  if (age < 65) return '55-64';
  if (age < 75) return '65-74';
  if (age < 85) return '75-84';
  return '85+';
}

export function formatPinDisplay(pin: string): string {
  const digits = pin.replace(/\D/g, '');
  if (digits.length !== 10) return pin;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function digitsOnly(raw: unknown): string {
  if (raw == null) return '';
  return String(raw).replace(/\D/g, '');
}
