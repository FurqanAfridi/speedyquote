export const CORE_COLUMNS = [
  { id: 'pin', label: 'PIN' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'name', label: 'Name' },
  { id: 'address1', label: 'Address' },
  { id: 'city', label: 'City' },
  { id: 'state', label: 'State' },
  { id: 'zip', label: 'ZIP' },
  { id: 'phone', label: 'Phone' },
  { id: 'homeowner', label: 'Homeowner' },
  { id: 'age', label: 'Age' }
] as const;

export type CoreColumnId = (typeof CORE_COLUMNS)[number]['id'];

export function attrColumnId(key: string) {
  return `attr:${key}`;
}

export function parseAttrColumnId(id: string): string | null {
  return id.startsWith('attr:') ? id.slice(5) : null;
}

/** Core database fields shown by default. Extra (attr:) columns stay hidden until chosen. */
export const DEFAULT_VISIBLE_COLUMNS: string[] = CORE_COLUMNS.map((c) => c.id);

export function resolveVisibleColumnIds(visible: string[]): string[] {
  return visible.length ? visible : [...DEFAULT_VISIBLE_COLUMNS];
}

export function isColumnVisible(visible: string[], id: string) {
  return resolveVisibleColumnIds(visible).includes(id);
}

export function resolvedVisibleIds(visible: string[], allIds: string[]) {
  const set = new Set(resolveVisibleColumnIds(visible));
  return allIds.filter((id) => set.has(id));
}

export function slugifyColumnKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export function defaultBatchTimestamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
