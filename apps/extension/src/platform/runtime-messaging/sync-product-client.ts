import type { AISecretUnlockResponse } from '../../contracts/messaging/ai-secret-unlock';
import { aiSecretUnlockResponseSchema } from '../../contracts/messaging/contracts/ai-secret-unlock-schemas';
import {
  parseSyncProductResult,
  parseSyncProductWork,
} from '../../contracts/messaging/contracts/runtime/sync-product';
import type {
  SyncCheckpointInterval,
  SyncCheckpointReceipt,
} from '../../composition/persistence/sync-capture/contracts';
import type {
  SyncConnectionIdentity,
  SyncWorkspaceSource,
} from '../../composition/persistence/remote-connection/model';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRuntimeMessagingTransport } from './chrome-transport';
import type {
  SyncProductCommand,
  SyncProductWork,
  SyncPopupRuntimeStatus,
  SyncProductResult,
  SyncRemoteSelection,
  SyncNativeEditingRoot,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';

const SETTLED_CHANNEL = 'sniptale-sync-product-settled';
const RECOVERY_INTERVAL_MS = 30_000;
type SettledKind = 'product' | 'workspace' | 'queue';
type OperationResult = Extract<SyncProductResult, { kind: 'operation' }>;

function subscribeSettled(callback: (requestId: string, kind: SettledKind) => void): () => void {
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(SETTLED_CHANNEL);
  } catch {
    return () => undefined;
  }
  channel.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const fields = Object.keys(data);
    if (fields.length !== 2 || !fields.includes('requestId') || !fields.includes('kind')) return;
    if (!('requestId' in data) || !('kind' in data)) return;
    if (
      typeof data.requestId !== 'string' ||
      (data.kind === 'queue'
        ? data.requestId.length === 0 || data.requestId.length > 256
        : !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            data.requestId
          )) ||
      (data.kind !== 'product' && data.kind !== 'workspace' && data.kind !== 'queue')
    )
      return;
    callback(data.requestId, data.kind);
  };
  return () => {
    channel.onmessage = null;
    try {
      channel.close();
    } catch {
      /* Notification cleanup has no execution authority. */
    }
  };
}

/** Advisory wakeup only. The receiving client must inspect the runtime owner. */
export function publishSyncProductSettled(requestId: string, kind: SettledKind): void {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(SETTLED_CHANNEL);
    channel.postMessage({ requestId, kind });
  } catch {
    // Completion remains valid when the disposable notification channel is unavailable.
  } finally {
    try {
      channel?.close();
    } catch {
      /* Advisory delivery is best effort. */
    }
  }
}

/** Queue completion is advisory; the scheduler reloads native authorization and due work. */
export function subscribeToSyncQueueSettled(callback: () => void): () => void {
  return subscribeSettled((_operationId, kind) => {
    if (kind === 'queue') callback();
  });
}

export function subscribeToWorkspaceSettled(callback: () => void): () => void {
  return subscribeSettled((_requestId, kind) => {
    if (kind === 'workspace') callback();
  });
}

/** Advisory completion requires a fresh status read; it conveys no operation authority. */
export function subscribeToSyncProductSettled(callback: () => void): () => void {
  return subscribeSettled((_requestId, kind) => {
    if (kind === 'product') callback();
  });
}

/** Typed finite product actions; runtime owners derive all privileged admission values. */
export function createSyncProductClient() {
  const transport = createRuntimeMessagingTransport();
  async function command(input: SyncProductCommand): Promise<SyncProductResult> {
    const response = await transport.sendRuntimeMessage({
      type: MessageType.SYNC_PRODUCT_COMMAND,
      requestId: crypto.randomUUID(),
      command: input,
    });
    if (!response.success) throw new Error('Sync product command refused');
    return response.result;
  }
  async function readRuntimeStatus(): Promise<SyncPopupRuntimeStatus> {
    try {
      const result = parseSyncProductResult(await command({ kind: 'runtime-status' }));
      if (result?.kind === 'runtime-status') return result.status;
    } catch {
      // Boundary failures expose a fixed message only.
    }
    throw new Error('Sync runtime status refused');
  }
  async function syncUnlock(
    input: { operation: 'start'; purpose: 'sync' } | { operation: 'status'; requestId: string }
  ): Promise<AISecretUnlockResponse> {
    try {
      const response = await transport.sendRuntimeMessage({
        type: MessageType.AI_SECRET_UNLOCK,
        ...input,
      });
      const parsed = aiSecretUnlockResponseSchema.safeParse(response);
      if (parsed.success && parsed.data.success && parsed.data.error === undefined)
        return parsed.data;
    } catch {
      // Provider errors and parser details do not enter public popup failures.
    }
    throw new Error('Sync unlock refused');
  }
  let pendingUnlock: Promise<AISecretUnlockResponse> | undefined;
  function startSyncUnlock(): Promise<AISecretUnlockResponse> {
    pendingUnlock ??= syncUnlock({ operation: 'start', purpose: 'sync' }).finally(() => {
      pendingUnlock = undefined;
    });
    return pendingUnlock;
  }
  function waitForOperation(
    requestId: string,
    signal?: AbortSignal,
    advisory?: true
  ): Promise<OperationResult> {
    return new Promise((resolve, reject) => {
      let finished = false;
      let inspecting = false;
      let inspectAgain = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: () => void = () => undefined;
      const cleanup = () => {
        finished = true;
        unsubscribe();
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      const abort = () => {
        cleanup();
        reject(signal?.reason ?? new DOMException('Operation observation aborted', 'AbortError'));
      };
      const inspect = async () => {
        if (finished) return;
        if (inspecting) {
          inspectAgain = true;
          return;
        }
        inspecting = true;
        clearTimeout(timer);
        try {
          const result = await command({
            kind: 'inspect',
            requestId,
            ...(advisory ? { advisory } : {}),
          });
          if (finished) return;
          if (result.kind !== 'operation') throw new Error('Sync product observation refused');
          if (!result.job || result.job.state !== 'running') {
            cleanup();
            resolve(result);
          }
        } catch (error) {
          if (!finished) {
            cleanup();
            reject(error);
          }
        } finally {
          inspecting = false;
          if (!finished) {
            if (inspectAgain) {
              inspectAgain = false;
              void inspect();
            } else
              timer = setTimeout(() => {
                void inspect();
              }, RECOVERY_INTERVAL_MS);
          }
        }
      };
      unsubscribe = subscribeSettled((id, kind) => {
        if (id === requestId && kind === 'product') void inspect();
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      else void inspect();
    });
  }
  return {
    waitForOperation,
    readRuntimeStatus,
    startSyncUnlock,
    readOwnSyncUnlock: (requestId: string): Promise<AISecretUnlockResponse> =>
      syncUnlock({ operation: 'status', requestId }),
    updateConnectionAuthentication: (
      input: Omit<Extract<SyncProductCommand, { kind: 'connection-authentication' }>, 'kind'>
    ) => command({ kind: 'connection-authentication', ...input }),
    resumeConnection: (expected: SyncConnectionIdentity) =>
      command({ kind: 'connection-resume', expected }),
    switchToLocalOnly: (expected: SyncConnectionIdentity) =>
      command({ kind: 'connection-local-only', expected }),
    subscribeToWorkspaceSettled,
    createWorkspace: (
      input: Omit<Extract<SyncProductCommand, { kind: 'workspace-create' }>, 'kind'>
    ) => command({ kind: 'workspace-create', ...input }),
    discoverWorkspace: (
      input: Omit<Extract<SyncProductCommand, { kind: 'workspace-discover' }>, 'kind'>
    ) => command({ kind: 'workspace-discover', ...input }),
    joinWorkspace: (input: Omit<Extract<SyncProductCommand, { kind: 'workspace-join' }>, 'kind'>) =>
      command({ kind: 'workspace-join', ...input }),
    retryWorkspace: (
      input: Omit<Extract<SyncProductCommand, { kind: 'workspace-retry' }>, 'kind'>
    ) => command({ kind: 'workspace-retry', ...input }),
    enrollWorkspace: (
      input: Omit<Extract<SyncProductCommand, { kind: 'workspace-enroll' }>, 'kind'>
    ) => command({ kind: 'workspace-enroll', ...input }),
    abandonWorkspace: (source: SyncWorkspaceSource) =>
      command({ kind: 'workspace-abandon', source }),
    readCacheStatus: () => command({ kind: 'cache-status' }),
    setCacheBudget: (budgetBytes: number, revision: number) =>
      command({ kind: 'cache-budget', budgetBytes, revision }),
    trimCache: () => command({ kind: 'cache-trim' }),
    readNativeCacheRoot: (root: SyncNativeEditingRoot) =>
      command({ kind: 'cache-root-status', root }),
    pinNative: (root: SyncNativeEditingRoot, pinned: boolean) =>
      command({ kind: 'cache-pin', root, pinned }),
    releaseNative: (root: SyncNativeEditingRoot) => command({ kind: 'native-release', root }),
    readCheckpointPolicy: () => command({ kind: 'checkpoint-policy' }),
    setCheckpointInterval: (intervalMs: SyncCheckpointInterval) =>
      command({ kind: 'checkpoint-interval', intervalMs }),
    flushCheckpoints: () => command({ kind: 'checkpoint-flush' }),
    /** Records an exact local exit intent; the result does not acknowledge network delivery. */
    requestCheckpointExit: async (receipt: SyncCheckpointReceipt) => {
      const result = parseSyncProductResult(await command({ kind: 'checkpoint-exit', receipt }));
      if (result?.kind !== 'checkpoint-exit') throw new Error('Sync checkpoint exit refused');
      return result;
    },
    /** Requests current due work; this receipt does not acknowledge checkpoint publication. */
    wakeCheckpoints: async () => {
      const result = parseSyncProductResult(await command({ kind: 'checkpoint-wake' }));
      if (result?.kind !== 'checkpoint-woken') throw new Error('Sync checkpoint wake refused');
      return result;
    },
    readStatus: () => command({ kind: 'status' }),
    refreshCatalog: (bypassCache = false) => command({ kind: 'catalog-refresh', bypassCache }),
    resolveConflict: (
      selection: SyncRemoteSelection,
      expectedHeads: string[],
      resolutionId: string = crypto.randomUUID()
    ) => command({ kind: 'conflict-resolve', selection, expectedHeads, resolutionId }),
    prepareLibraryBackup: async (
      target: Omit<Extract<SyncProductWork, { kind: 'library-backup-prepare' }>, 'kind'>
    ) => {
      const input = target.options;
      const selected =
        input.scope === 'selected' && input.selected
          ? {
              mediaAssetIds: [...new Set(input.selected.mediaAssetIds)],
              scenarioProjectIds: [...new Set(input.selected.scenarioProjectIds)],
              videoProjectIds: [...new Set(input.selected.videoProjectIds)],
            }
          : undefined;
      const work = parseSyncProductWork({
        kind: 'library-backup-prepare',
        expected: { incarnation: target.expected.incarnation, revision: target.expected.revision },
        options: {
          includeDrafts: input.includeDrafts,
          includeSourceMetadata: input.includeSourceMetadata,
          includeTelemetry: input.includeTelemetry,
          includeWebSnapshots: input.includeWebSnapshots,
          scope: input.scope,
          ...(selected ? { selected } : {}),
        },
      });
      if (work?.kind !== 'library-backup-prepare')
        throw new Error('Library backup selection is invalid.');
      return command(work);
    },
    prepareNativeBackup: (root: SyncNativeEditingRoot) => command({ kind: 'backup-prepare', root }),
    prepareNative: (root: SyncNativeEditingRoot) => command({ kind: 'native-prepare', root }),
    prepareScenarioExport: (
      target: Omit<Extract<SyncProductWork, { kind: 'scenario-export-prepare' }>, 'kind'>
    ) =>
      command({
        kind: 'scenario-export-prepare',
        projectId: target.projectId,
        exportId: target.exportId,
      }),
    prepareReplica: (selection: SyncRemoteSelection, preserveNative?: true) =>
      command({
        kind: 'replica-prepare',
        selection,
        ...(preserveNative ? { preserveNative } : {}),
      }),
    readThumbnail: (selection: SyncRemoteSelection) =>
      command({ kind: 'thumbnail-read', selection }),
    inspect: (requestId: string) => command({ kind: 'inspect', requestId }),
    cancel: (requestId: string, advisory?: true) =>
      command({ kind: 'cancel', requestId, ...(advisory ? { advisory } : {}) }),
  };
}
