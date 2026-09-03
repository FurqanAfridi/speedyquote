export type MappedField =
  | 'pin'
  | 'first_name'
  | 'last_name'
  | 'address1'
  | 'address2'
  | 'city'
  | 'state'
  | 'zip'
  | 'zip4'
  | 'age'
  | 'homeowner_status'
  | 'known_phone'
  | 'list_source'
  | 'vertical'
  | 'attrs'
  | 'ignore'
  | `attr:${string}`;

export type ColumnMapping = Record<string, MappedField | string>;

export type ListRecordInput = {
  pin: string;
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip4?: string | null;
  age?: number | null;
  homeowner_status?: string | null;
  known_phone?: string | null;
  list_source?: string | null;
  vertical?: string | null;
  attrs?: Record<string, string>;
};

export type UploadListInput = {
  records: ListRecordInput[];
  listSource?: string | null;
  vertical?: string | null;
  /** Extra column keys to register in portal_settings when missing. */
  registerExtraKeys?: string[];
};

export type UploadedPiece = {
  piece_id: number | null;
  record_id: number;
  pin_code: string | null;
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
  created_at: string | null;
  attrs: Record<string, string>;
};

export type PortalVertical = {
  name: string;
};

export type PortalExtraColumn = {
  key: string;
  default_value: string;
};

export type PortalSettings = {
  org_name: string;
  default_list_source: string;
  verticals: PortalVertical[];
  extra_columns: PortalExtraColumn[];
  visible_columns: string[];
};

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  org_name: 'Speedy Quote',
  default_list_source: 'Upload',
  verticals: [],
  extra_columns: [],
  visible_columns: []
};

export type RecordMutationInput = {
  record_id?: number;
  pin: string;
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  zip4?: string | null;
  age?: number | null;
  homeowner_status?: string | null;
  known_phone?: string | null;
  list_source?: string | null;
  vertical?: string | null;
  attrs?: Record<string, string>;
};

export type UploadListResult = {
  recordsInserted: number;
  piecesCreated: number;
  skippedNoPin: number;
  samplePieces: UploadedPiece[];
};
