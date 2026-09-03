import type { ColumnMapping, ListRecordInput, MappedField } from '../api/types';

export const FIELD_LABELS: { value: MappedField; label: string }[] = [
  { value: 'pin', label: 'PIN (lookup)' },
  { value: 'known_phone', label: 'Phone / caller ID (lookup)' },
  { value: 'zip', label: 'ZIP (lookup)' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'address1', label: 'Address' },
  { value: 'address2', label: 'Address 2' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'age', label: 'Age' },
  { value: 'homeowner_status', label: 'Homeowner' },
  { value: 'attrs', label: 'Keep as extra attribute' },
  { value: 'ignore', label: 'Skip' }
];

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
  state: 'state',
  st: 'state',
  zip: 'zip',
  zipcode: 'zip',
  zip_code: 'zip',
  postal: 'zip',
  postal_code: 'zip',
  age: 'age',
  homeowner_status: 'homeowner_status',
  homeowner: 'homeowner_status',
  homeownerprobabilitymodel: 'homeowner_status',
  homeowner_probability_model: 'homeowner_status',
  known_phone: 'known_phone',
  phone: 'known_phone',
  phonenumber: 'known_phone',
  phone_number: 'known_phone',
  caller_id: 'known_phone',
  ani: 'known_phone'
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

export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    mapping[h] = HEADER_TO_FIELD[normalizeHeader(h)] ?? 'attrs';
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

export function applyMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping
): { records: ListRecordInput[]; skippedNoPin: number } {
  const records: ListRecordInput[] = [];
  let skippedNoPin = 0;
  const extraHeaders = Object.keys(mapping).filter((h) => mapping[h] === 'attrs');

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
    const zipDigits = (get('zip') ?? '').replace(/\D/g, '');

    const attrs: Record<string, string> = {};
    for (const h of extraHeaders) {
      const v = row[h]?.trim();
      if (v) attrs[h] = v;
    }
    if (ageRaw && age == null) attrs.age = ageRaw;

    records.push({
      pin,
      first_name: get('first_name') || null,
      last_name: get('last_name') || null,
      address1: get('address1') || null,
      address2: get('address2') || null,
      city: get('city') || null,
      state: get('state') || null,
      zip: zipDigits.slice(0, 5) || get('zip') || null,
      zip4: zipDigits.slice(5, 9) || null,
      age,
      homeowner_status: parseHomeowner(get('homeowner_status')),
      known_phone: get('known_phone') || null,
      attrs
    });
  }

  return { records, skippedNoPin };
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
