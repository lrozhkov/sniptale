import type { SyncProductResult } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import { createSyncProductClient } from '../../platform/runtime-messaging/sync-product-client';
import { ensureNativeBackupRootAvailable } from './editing-admission';
import {
  prepareRetainedLibrary,
  readRetainedNativeRoots,
  type RetainedLibraryPlan,
} from './retained-library';

/** Safe native refusal; details contain no endpoint, credential or original data. */
export class LocalOnlySwitchError extends Error {
  constructor(readonly code: Extract<SyncProductResult, { kind: 'local-only-refused' }>['code']) {
    super('Local-only transition refused.');
  }
}

/** Prepare the same retained set as full backup, then ask the runtime to drain and retire its exact connection. */
export async function switchLibraryToLocalOnly(
  plan: RetainedLibraryPlan,
  signal?: AbortSignal
): Promise<'delivered' | 'incomplete'> {
  return runWithAssetResourceRead(async () => {
    signal?.throwIfAborted();
    await prepareRetainedLibrary(plan, signal);
    for (const root of await readRetainedNativeRoots()) {
      signal?.throwIfAborted();
      await ensureNativeBackupRootAvailable(root, signal);
    }
    signal?.throwIfAborted();
    const result = await createSyncProductClient().switchToLocalOnly(plan.authorization);
    // A committed atomic detach wins over a late cancellation request.
    if (result.kind === 'local-only-refused') throw new LocalOnlySwitchError(result.code);
    if (result.kind !== 'local-only') throw new Error('Local-only transition refused.');
    return result.history;
  });
}
