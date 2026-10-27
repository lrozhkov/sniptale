import type { CapturedChange } from '../../../apps/extension/src/composition/persistence/sync-capture/contracts';
import { loadPreparedOutgoingOperation } from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing';
import { loadOutgoingDispatchAttempt } from '../../../apps/extension/src/composition/persistence/sync-capture/outgoing-attempts';
import {
  prepareCapturedOutgoing,
  dispatchPreparedOutgoing,
} from '../../../apps/extension/src/workflows/sync-transfer/outgoing';
import type { SyncRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

/** Runs production encoding and dispatch over actual captured native sources. */
export function createWebdavOutgoingHarness(
  connected: () => SyncRemoteStore,
  latest: (rootId: string) => Promise<CapturedChange>
) {
  return {
    prepare: async (rootId: string) => {
      const prepared = await prepareCapturedOutgoing(await latest(rootId));
      return {
        spaceId: prepared.spaceId,
        operationId: prepared.operationId,
        recordText: prepared.recordText,
        recordSha256: prepared.recordSha256,
        attemptKey: prepared.attemptKey,
        objects: prepared.objects.map((item) => ({
          objectId: item.objectId,
          key: item.remoteKey,
          size: item.ref.size,
          sha256: item.sha256,
        })),
      };
    },
    send: (spaceId: string, operationId: string) =>
      dispatchPreparedOutgoing(spaceId, operationId, connected(), new AbortController().signal),
    prepared: loadPreparedOutgoingOperation,
    attempt: loadOutgoingDispatchAttempt,
  };
}
