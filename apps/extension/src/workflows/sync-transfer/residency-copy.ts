import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import type { scanSyncCatalog } from './catalog';
import { RemoteContentMismatch, verifyRemoteObject } from './remote-object-integrity';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';

interface CatalogCopy {
  spaceId: string;
  operationId: string;
  objectId: string;
  attemptId: string;
  recordKey: string;
  remoteKey: string;
  sha256: string;
  size: number;
}

/** Operation-local lookup. This metadata gives no native byte-release authority. */
export interface CatalogCopyIndex {
  readonly spaceId: string;
  readonly operations: ReadonlyMap<string, { rootKind: string; rootId: string }>;
  readonly copies: ReadonlyMap<string, readonly CatalogCopy[]>;
}

function digestKey(sha256: string, size: number): string {
  return `${sha256}:${size}`;
}

/** Index checked physical alternatives once; native identities need not match sender IDs. */
export function indexCatalogCopies(
  catalog: Awaited<ReturnType<typeof scanSyncCatalog>>,
  spaceId: string
): CatalogCopyIndex {
  const copies = new Map<string, CatalogCopy[]>();
  const operations = new Map<string, { rootKind: string; rootId: string }>();
  const seen = new Set<string>();
  const unavailable = new Set([
    ...catalog.quarantined,
    ...catalog.pending,
    ...catalog.invalidOperations,
  ]);
  for (const entry of catalog.operations.values()) {
    const operation = entry.operation;
    if (
      operation.spaceId !== spaceId ||
      !operation.envelope ||
      unavailable.has(operation.operationId)
    )
      continue;
    operations.set(operation.operationId, {
      rootKind: operation.rootKind,
      rootId: operation.rootId,
    });
    const objects = new Map(operation.envelope.objects.map((object) => [object.objectId, object]));
    const digests = new Map(operation.objects.map((object) => [object.objectId, object.sha256]));
    for (const attempt of entry.attempts) {
      for (const binding of attempt.objects) {
        const object = objects.get(binding.objectId);
        const sha256 = digests.get(binding.objectId);
        if (!object || !sha256) continue;
        const key = digestKey(sha256, object.size);
        const identity = JSON.stringify([key, binding.remoteKey]);
        if (seen.has(identity)) continue;
        seen.add(identity);
        const alternatives = copies.get(key) ?? [];
        alternatives.push({
          spaceId,
          operationId: operation.operationId,
          objectId: object.objectId,
          attemptId: attempt.attemptId,
          recordKey: attempt.recordKey,
          remoteKey: binding.remoteKey,
          sha256,
          size: object.size,
        });
        copies.set(key, alternatives);
      }
    }
  }
  return { spaceId, operations, copies };
}

/**
 * Check actual local and remote bytes. The caller must still admit the current native copy,
 * lifetime, pins, claims and readers before it records an unload intent.
 */
export async function verifyCatalogCopy(
  index: CatalogCopyIndex,
  source: Blob,
  remote: SyncRemoteStore,
  signal: AbortSignal
): Promise<CatalogCopy | null> {
  signal.throwIfAborted();
  const sha256 = await digestBackupObject(
    {
      size: source.size,
      pipeTo: (sink, abort) => source.stream().pipeTo(sink, abort ? { signal: abort } : {}),
    },
    signal
  );
  signal.throwIfAborted();
  const candidates = (index.copies.get(digestKey(sha256, source.size)) ?? []).map((copy) => ({
    ...copy,
  }));
  for (const candidate of candidates) {
    signal.throwIfAborted();
    if (candidate.spaceId !== index.spaceId) continue;
    try {
      await verifyRemoteObject(remote, candidate.remoteKey, source.size, sha256, signal);
      signal.throwIfAborted();
      return candidate;
    } catch (error) {
      signal.throwIfAborted();
      if (
        error instanceof RemoteContentMismatch ||
        (error instanceof SyncRemoteError && error.code === 'missing')
      )
        continue;
      throw error;
    }
  }
  return null;
}
