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
  { id: 'age', label: 'Age' },
  { id: 'list_source', label: 'List source' }
] as const;

export type CoreColumnId = (typeof CORE_COLUMNS)[number]['id'];

export function attrColumnId(key: string) {
  return `attr:${key}`;
}

export function parseAttrColumnId(id: string): string | null {
  return id.startsWith('attr:') ? id.slice(5) : null;
}

export const DEFAULT_VISIBLE_COLUMNS = [
  'pin',
  'vertical',
  'name',
  'city',
  'state',
  'zip'
] as const;

/** Empty saved selection uses the compact default set so the table does not stretch. */
export function isColumnVisible(visible: string[], id: string) {
  const set = visible.length ? visible : DEFAULT_VISIBLE_COLUMNS;
  return set.includes(id);
}

export function resolvedVisibleIds(visible: string[], allIds: string[]) {
  const set = visible.length ? visible : [...DEFAULT_VISIBLE_COLUMNS];
  return allIds.filter((id) => set.includes(id));
}

export function slugifyColumnKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}
