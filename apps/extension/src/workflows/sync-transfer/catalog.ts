import type { CachedSyncManifest } from '../../composition/persistence/sync-catalog/catalog-cache';
import { projectSyncCatalog, type CatalogAttempt } from './catalog-graph';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { hashSyncText, parseSyncAttemptText } from './wire-record';

const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_SCAN_BYTES = 64 * 1024 * 1024;
const MAX_MANIFESTS = 10_000;
const MAX_PAGES = 1024;
const MANIFEST_NAME =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-f0-9]{64}\.json$/u;

/** Fixed scanner failures retain no provider body, credentials or untrusted message. */
export class SyncCatalogError extends Error {
  constructor(
    readonly code:
      | 'invalid-space'
      | 'metadata-limit'
      | 'pagination-cycle'
      | 'unavailable'
      | 'cancelled'
  ) {
    super(code);
    this.name = 'SyncCatalogError';
  }
}
class InvalidManifestError extends Error {}

async function readMetadata(
  remote: SyncRemoteStore,
  key: string,
  size: number,
  budget: { bytes: number },
  signal: AbortSignal
) {
  const stream = await remote.read(key, signal);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    await stream.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          bytes += chunk.byteLength;
          budget.bytes += chunk.byteLength;
          if (budget.bytes > MAX_SCAN_BYTES) throw new SyncCatalogError('metadata-limit');
          if (bytes > size || bytes > MAX_MANIFEST_BYTES) throw new InvalidManifestError();
          chunks.push(new Uint8Array(chunk));
        },
      }),
      { signal }
    );
  } catch (error) {
    if (signal.aborted) throw new SyncCatalogError('cancelled');
    if (error instanceof SyncCatalogError || error instanceof InvalidManifestError) throw error;
    throw new SyncCatalogError('unavailable');
  }
  if (bytes !== size) throw new InvalidManifestError();
  const payload = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    // Preserve a BOM so exact-byte hashing and canonical JSON cannot silently strip it.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload);
  } catch {
    throw new InvalidManifestError();
  }
}

export async function checkedSyncCatalogManifest(text: string, key: string, spaceId: string) {
  if (!key.endsWith(`-${hashSyncText(text)}.json`)) throw new InvalidManifestError();
  try {
    const parsed = await parseSyncAttemptText(text);
    if (parsed.recordKey !== key || parsed.operation.spaceId !== spaceId)
      throw new InvalidManifestError();
    return parsed;
  } catch {
    throw new InvalidManifestError();
  }
}

/** Complete bounded metadata enumeration without native persistence or media reads. */
export async function scanSyncCatalog(
  remote: SyncRemoteStore,
  spaceId: string,
  signal: AbortSignal,
  options: { cachedManifests?: readonly CachedSyncManifest[] } = {}
) {
  return (await scanSyncCatalogSnapshot(remote, spaceId, signal, options.cachedManifests)).catalog;
}

/** Raw checked manifests accompany only a complete scan; derived graph state is never cached. */
export async function scanSyncCatalogSnapshot(
  remote: SyncRemoteStore,
  spaceId: string,
  signal: AbortSignal,
  cachedManifests: readonly CachedSyncManifest[] = []
) {
  if (!spaceId || spaceId.length > 256) throw new SyncCatalogError('invalid-space');
  signal.throwIfAborted();
  const prefix = `.sniptale/${hashSyncText(spaceId)}/records/`;
  const attempts: CatalogAttempt[] = [];
  const manifests: CachedSyncManifest[] = [];
  const cached = new Map(
    cachedManifests
      .slice(0, MAX_MANIFESTS)
      .map((entry) => [
        entry.manifestKey,
        { manifestKey: entry.manifestKey, size: entry.size, text: entry.text },
      ])
  );
  const invalid: { key: string; code: 'invalid-key' | 'invalid-manifest' }[] = [];
  const visitedCursors = new Set<string>();
  const visitedKeys = new Map<string, number>();
  const budget = { bytes: 0 };
  let cursor: string | undefined;
  let pages = 0;
  for (;;) {
    signal.throwIfAborted();
    if (++pages > MAX_PAGES) throw new SyncCatalogError('metadata-limit');
    let page;
    try {
      page = await remote.list(prefix, { signal, ...(cursor ? { cursor } : {}) });
    } catch (error) {
      if (pages === 1 && error instanceof SyncRemoteError && error.code === 'missing') break;
      throw error;
    }
    for (const item of page.objects) {
      if (visitedKeys.has(item.key)) {
        if (visitedKeys.get(item.key) !== item.size) throw new SyncCatalogError('unavailable');
        continue;
      }
      budget.bytes += new TextEncoder().encode(item.key).byteLength;
      if (budget.bytes > MAX_SCAN_BYTES) throw new SyncCatalogError('metadata-limit');
      visitedKeys.set(item.key, item.size);
      if (visitedKeys.size > MAX_MANIFESTS) throw new SyncCatalogError('metadata-limit');
      if (!item.key.startsWith(prefix) || !MANIFEST_NAME.test(item.key.slice(prefix.length))) {
        invalid.push({ key: item.key.slice(0, 512), code: 'invalid-key' });
        continue;
      }
      if (!Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_MANIFEST_BYTES) {
        invalid.push({ key: item.key, code: 'invalid-manifest' });
        continue;
      }
      try {
        let text: string | undefined;
        let parsed: Awaited<ReturnType<typeof checkedSyncCatalogManifest>> | undefined;
        const entry = cached.get(item.key);
        if (entry && entry.size === item.size && entry.text.length <= MAX_MANIFEST_BYTES) {
          try {
            if (new TextEncoder().encode(entry.text).byteLength !== item.size)
              throw new InvalidManifestError();
            parsed = await checkedSyncCatalogManifest(entry.text, item.key, spaceId);
            text = entry.text;
            budget.bytes += item.size;
            if (budget.bytes > MAX_SCAN_BYTES) throw new SyncCatalogError('metadata-limit');
          } catch (error) {
            if (!(error instanceof InvalidManifestError)) throw error;
          }
        }
        if (text === undefined || parsed === undefined) {
          text = await readMetadata(remote, item.key, item.size, budget, signal);
          parsed = await checkedSyncCatalogManifest(text, item.key, spaceId);
        }
        manifests.push({ manifestKey: item.key, size: item.size, text });
        attempts.push({
          operationText: JSON.stringify(parsed.operation),
          operation: parsed.operation,
          recordKey: parsed.recordKey,
          attemptId: parsed.attemptId,
          objects: parsed.objects,
        });
      } catch (error) {
        if (!(error instanceof InvalidManifestError)) throw error;
        invalid.push({ key: item.key, code: 'invalid-manifest' });
      }
    }
    if (page.nextCursor === null) break;
    if (!page.nextCursor || visitedCursors.has(page.nextCursor))
      throw new SyncCatalogError('pagination-cycle');
    visitedCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  signal.throwIfAborted();
  return {
    catalog: {
      ...projectSyncCatalog(spaceId, attempts),
      invalid,
      metadataBytes: budget.bytes,
      pages,
    },
    manifests,
  };
}
