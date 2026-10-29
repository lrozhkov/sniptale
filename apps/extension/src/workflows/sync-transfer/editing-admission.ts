import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import { createLogger } from '@sniptale/platform/observability/logger';
import { touchNativeCacheRoot } from './native-cache';
import { createSyncProductClient } from '../../platform/runtime-messaging/sync-product-client';
import type { SyncNativeEditingRoot } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { isNativeEditingRootReady, needsNativeEditingPreparation } from './native-residency';

const logger = createLogger({ namespace: 'SyncEditingAdmission' });
async function used(root: SyncNativeEditingRoot): Promise<void> {
  try {
    await touchNativeCacheRoot(root);
  } catch {
    logger.warn('sync-cache-usage-deferred');
  }
}

/** The caller retains its existing reader lease through preparation and editor use. */
export async function ensureNativeEditingRootAvailable(root: SyncNativeEditingRoot): Promise<void> {
  if (!(await needsNativeEditingPreparation(root))) {
    await used(root);
    return;
  }
  const client = createSyncProductClient();
  const accepted = await client.prepareNative(root);
  if (accepted.kind !== 'accepted') throw new Error('Native resource preparation refused.');
  const result = await client.waitForOperation(accepted.requestId);
  if (
    result.job?.state !== 'ready' ||
    result.completion?.kind !== 'native' ||
    result.completion.root.rootKind !== root.rootKind ||
    result.completion.root.rootId !== root.rootId ||
    !(await isNativeEditingRootReady(root))
  )
    throw new Error('Native editing resources are unavailable.');
  await used(root);
}

/** Archive callers retain their existing reader through preparation and final archive write. */
export async function ensureNativeBackupRootAvailable(
  root: SyncNativeEditingRoot,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  if (!(await needsNativeEditingPreparation(root, 'backup'))) return;
  const client = createSyncProductClient();
  const accepted = await client.prepareNativeBackup(root);
  if (accepted.kind !== 'accepted') throw new Error('Native backup preparation refused.');
  const cancel = () => {
    void client
      .cancel(accepted.requestId)
      .catch(() => logger.warn('backup-preparation-cancel-deferred'));
  };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    // Keep the reader until the executor settles, even when cancellation is refused.
    const result = await client.waitForOperation(accepted.requestId);
    signal?.throwIfAborted();
    if (
      result.job?.state !== 'ready' ||
      result.completion?.kind !== 'native' ||
      result.completion.root.rootKind !== root.rootKind ||
      result.completion.root.rootId !== root.rootId ||
      !(await isNativeEditingRootReady(root, 'backup'))
    )
      throw new Error('Native backup resources are unavailable.');
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

/** Keep native publication inputs available until the existing writer settles. */
export async function runWithNativePublicationResources<T>(
  roots: readonly SyncNativeEditingRoot[],
  operation: () => Promise<T>
): Promise<T> {
  return runWithAssetResourceRead(async () => {
    const prepared = new Set<string>();
    for (const root of roots) {
      const key = JSON.stringify([root.rootKind, root.rootId]);
      if (prepared.has(key)) continue;
      // Capture publication uses the archive closure, including retained exports.
      await ensureNativeBackupRootAvailable(root);
      prepared.add(key);
    }
    return operation();
  });
}
