import { isEditorVectorCacheRow, type EditorVectorCacheRow } from './contracts';

export const EDITOR_VECTOR_CACHE_MAX_BYTES = 20 * 1024 * 1024;

export function editorVectorCacheKey(key: {
  sourceId: string;
  kind: EditorVectorCacheRow['cacheKind'];
  id: string;
}): string {
  return `cache:${key.kind}:${encodeURIComponent(key.sourceId)}:${encodeURIComponent(key.id)}`;
}

export function prepareEditorVectorCacheRow(
  key: { sourceId: string; kind: EditorVectorCacheRow['cacheKind']; id: string },
  payload: unknown,
  timestamp: number,
  budget: number
): EditorVectorCacheRow | null {
  const json = JSON.stringify(payload);
  if (typeof json !== 'string') return null;
  const size = new TextEncoder().encode(json).byteLength;
  if (size > budget || size > 4 * 1024 * 1024) return null;
  const detached: unknown = JSON.parse(json);
  const row: EditorVectorCacheRow = {
    key: editorVectorCacheKey(key),
    kind: 'cache',
    cacheKind: key.kind,
    sourceId: key.sourceId,
    createdAt: timestamp,
    touchedAt: timestamp,
    expiresAt:
      key.kind === 'search'
        ? timestamp + 15 * 60 * 1000
        : key.kind === 'collections'
          ? timestamp + 24 * 60 * 60 * 1000
          : Number.MAX_SAFE_INTEGER,
    size,
    payload: detached,
  };
  return isEditorVectorCacheRow(row) ? row : null;
}

/** The plan only deletes advisory rows; byte owners and accepted library rows are excluded. */
export function planEditorVectorCacheEviction(
  cached: unknown[],
  replacement: EditorVectorCacheRow,
  timestamp: number,
  budget: number
): string[] {
  const removed: string[] = [];
  const live: EditorVectorCacheRow[] = [];
  for (const existing of cached) {
    if (!isEditorVectorCacheRow(existing)) continue;
    if (existing.expiresAt <= timestamp || existing.key === replacement.key)
      removed.push(existing.key);
    else live.push(existing);
  }
  let bytes = live.reduce((total, existing) => total + existing.size, replacement.size);
  for (const existing of live.sort(
    (left, right) => left.touchedAt - right.touchedAt || left.key.localeCompare(right.key)
  )) {
    if (bytes <= budget) break;
    removed.push(existing.key);
    bytes -= existing.size;
  }
  return removed;
}
