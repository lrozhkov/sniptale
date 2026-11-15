import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

export interface EditorVectorSourceToken {
  sourceId: string;
  incarnation: string;
  generation: number;
}

/** Iconify recommends an expanded metadata page to avoid repeated search scans. */
export const VECTOR_CATALOG_MAX_SEARCH_RESULTS = 999;

export type CatalogOperation = 'collections' | 'search' | 'collection' | 'assets' | 'check';
interface CatalogCollectionInfo {
  name: string;
  total: number;
  author?: { name: string; url?: string };
  license?: { title: string; spdx?: string; url?: string };
}
interface CatalogSearchData {
  icons: string[];
  start: number;
  limit: number;
  total?: number;
}
interface CatalogDataByOperation {
  collections: Record<string, CatalogCollectionInfo>;
  search: CatalogSearchData;
  collection: Record<string, unknown>;
  assets: Record<string, unknown>;
  check: { collections: boolean; search: boolean };
}
export type CatalogParameters =
  | { operation: 'collections' | 'check' }
  | { operation: 'search'; query: string; prefix?: string; start?: number; limit?: number }
  | { operation: 'collection'; prefix: string }
  | { operation: 'assets'; prefix: string; names: readonly string[] };
export type CatalogRequest = CatalogParameters & {
  requestId: string;
  source: EditorVectorSourceToken;
};
export type CatalogCommand = CatalogRequest | { operation: 'cancel'; requestId: string };
export type CatalogSuccess = {
  [K in CatalogOperation]: {
    success: true;
    operation: K;
    source: EditorVectorSourceToken;
    data: CatalogDataByOperation[K];
  };
}[CatalogOperation];
const CATALOG_ERROR_CODES = [
  'unauthorized',
  'invalid-request',
  'network-disabled',
  'disclosure-required',
  'permission-required',
  'source-changed',
  'timeout',
  'rate-limited',
  'network-failed',
  'response-invalid',
  'response-too-large',
  'canceled',
  'busy',
  'http-error',
  'forbidden',
  'unsupported-search',
] as const;
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];
type CatalogFailure = {
  success: false;
  error: CatalogErrorCode;
  retryAfterSeconds?: number;
};
export type CatalogResponse =
  | CatalogSuccess
  | CatalogFailure
  | { success: true; operation: 'cancel' };
export type CatalogResult<K extends CatalogOperation> = {
  source: EditorVectorSourceToken;
  data: CatalogDataByOperation[K];
};

/** Fixed failure codes contain neither a search query nor provider response text. */
export class EditorVectorCatalogError extends Error {
  constructor(
    readonly code: CatalogErrorCode,
    readonly retryAfterSeconds?: number
  ) {
    super(`Vector catalog request failed: ${code}.`);
    this.name = 'EditorVectorCatalogError';
  }
}
export const catalogName = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 128 &&
  value.split('-').every((part) => /^[a-z0-9]+$/u.test(part));
function text(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  for (const character of value) {
    if (character.charCodeAt(0) < 32) return false;
  }
  return true;
}
const integer = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
/** Pure source identity validation; settings persistence owns token issuance and admission. */
export function isEditorVectorSourceToken(value: unknown): value is EditorVectorSourceToken {
  return (
    isRecord(value) &&
    text(value['sourceId']) &&
    value['sourceId'].length > 0 &&
    text(value['incarnation']) &&
    value['incarnation'].length > 0 &&
    integer(value['generation'], Number.MAX_SAFE_INTEGER)
  );
}
export function sameCatalogSource(
  left: EditorVectorSourceToken,
  right: EditorVectorSourceToken
): boolean {
  return (
    left.sourceId === right.sourceId &&
    left.incarnation === right.incarnation &&
    left.generation === right.generation
  );
}
/** Parse operation parameters without allowing callers to choose request URLs. */
export function isCatalogCommand(value: unknown): value is CatalogCommand {
  if (
    !isRecord(value) ||
    typeof value['requestId'] !== 'string' ||
    !/^[a-zA-Z0-9-]{1,128}$/u.test(value['requestId'])
  )
    return false;
  if (value['operation'] === 'cancel') return true;
  if (!isEditorVectorSourceToken(value['source'])) return false;
  if (value['operation'] === 'collections' || value['operation'] === 'check') return true;
  if (value['operation'] === 'search')
    return (
      text(value['query']) &&
      value['query'].trim().length > 0 &&
      value['query'].length <= 256 &&
      (value['prefix'] === undefined || catalogName(value['prefix'])) &&
      (value['start'] === undefined || integer(value['start'], 1_000_000)) &&
      (value['limit'] === undefined ||
        (integer(value['limit'], VECTOR_CATALOG_MAX_SEARCH_RESULTS) && value['limit'] >= 32))
    );
  if (!catalogName(value['prefix'])) return false;
  if (value['operation'] === 'collection') return true;
  return (
    value['operation'] === 'assets' &&
    Array.isArray(value['names']) &&
    value['names'].length >= 1 &&
    value['names'].length <= 64 &&
    value['names'].every(catalogName)
  );
}

function collectionInfo(value: unknown): value is CatalogCollectionInfo {
  if (!isRecord(value) || !text(value['name']) || !integer(value['total'], 1_000_000)) return false;
  for (const key of ['author', 'license']) {
    const entry = value[key];
    if (entry === undefined) continue;
    if (!isRecord(entry) || !text(entry[key === 'author' ? 'name' : 'title'])) return false;
    if (entry['url'] !== undefined && !text(entry['url'])) return false;
    if (entry['spdx'] !== undefined && !text(entry['spdx'])) return false;
  }
  return true;
}
/** Bound structural metadata in both transports; SVG semantics remain at the editor import boundary. */
export function isCatalogData<K extends CatalogOperation>(
  operation: K,
  value: unknown
): value is CatalogDataByOperation[K] {
  if (!isRecord(value)) return false;
  if (operation === 'collections')
    return (
      Object.keys(value).length <= 20_000 &&
      Object.entries(value).every(([prefix, info]) => catalogName(prefix) && collectionInfo(info))
    );
  if (operation === 'search')
    return (
      Array.isArray(value['icons']) &&
      value['icons'].length <= VECTOR_CATALOG_MAX_SEARCH_RESULTS &&
      value['icons'].every(
        (id) =>
          typeof id === 'string' && id.split(':').length === 2 && id.split(':').every(catalogName)
      ) &&
      integer(value['start'], 1_000_000) &&
      integer(value['limit'], VECTOR_CATALOG_MAX_SEARCH_RESULTS) &&
      value['limit'] >= 1 &&
      (value['total'] === undefined || integer(value['total'], 1_000_000))
    );
  if (operation === 'check')
    return typeof value['collections'] === 'boolean' && typeof value['search'] === 'boolean';
  if (!catalogName(value['prefix'])) return false;
  if (operation === 'assets')
    return isRecord(value['icons']) && Object.keys(value['icons']).length <= 20_000;
  return (
    ['uncategorized', 'hidden'].every(
      (key) =>
        value[key] === undefined ||
        (Array.isArray(value[key]) && value[key].length <= 20_000 && value[key].every(catalogName))
    ) &&
    (value['categories'] === undefined ||
      (isRecord(value['categories']) &&
        Object.keys(value['categories']).length <= 20_000 &&
        Object.values(value['categories']).every(
          (names) => Array.isArray(names) && names.length <= 20_000 && names.every(catalogName)
        )))
  );
}
export function isCatalogResponse(value: unknown): value is CatalogResponse {
  if (!isRecord(value)) return false;
  if (value['success'] === false)
    return (
      CATALOG_ERROR_CODES.some((code) => code === value['error']) &&
      (value['retryAfterSeconds'] === undefined || integer(value['retryAfterSeconds'], 86400))
    );
  if (value['success'] !== true) return false;
  if (value['operation'] === 'cancel') return true;
  if (!isEditorVectorSourceToken(value['source'])) return false;
  switch (value['operation']) {
    case 'collections':
    case 'search':
    case 'collection':
    case 'assets':
    case 'check':
      return isCatalogData(value['operation'], value['data']);
    default:
      return false;
  }
}
