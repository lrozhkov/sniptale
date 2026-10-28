import type { SyncWorkspaceSource } from '../../composition/persistence/remote-connection/model';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createRuntimeMessagingTransport } from './chrome-transport';
import type {
  SyncProductCommand,
  SyncProductResult,
  SyncRemoteSelection,
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
    subscribeToWorkspaceSettled,
    createWorkspace: (
      input: Omit<Extract<SyncProductCommand, { kind: 'workspace-create' }>, 'kind'>
    ) => command({ kind: 'workspace-create', ...input }),
    joinWorkspace: (input: Omit<Extract<SyncProductCommand, { kind: 'workspace-join' }>, 'kind'>) =>
      command({ kind: 'workspace-join', ...input }),
    retryWorkspace: (
      input: Omit<
        Extract<SyncProductCommand, { kind: 'workspace-retry' | 'workspace-enroll' }>,
        'kind'
      >
    ) => command({ kind: 'workspace-retry', ...input }),
    enrollWorkspace: (
      input: Omit<
        Extract<SyncProductCommand, { kind: 'workspace-retry' | 'workspace-enroll' }>,
        'kind'
      >
    ) => command({ kind: 'workspace-enroll', ...input }),
    abandonWorkspace: (source: SyncWorkspaceSource) =>
      command({ kind: 'workspace-abandon', source }),
    readStatus: () => command({ kind: 'status' }),
    refreshCatalog: (bypassCache = false) => command({ kind: 'catalog-refresh', bypassCache }),
    resolveConflict: (
      selection: SyncRemoteSelection,
      expectedHeads: string[],
      resolutionId: string = crypto.randomUUID()
    ) => command({ kind: 'conflict-resolve', selection, expectedHeads, resolutionId }),
    prepareReplica: (selection: SyncRemoteSelection) =>
      command({ kind: 'replica-prepare', selection }),
    readThumbnail: (selection: SyncRemoteSelection) =>
      command({ kind: 'thumbnail-read', selection }),
    inspect: (requestId: string) => command({ kind: 'inspect', requestId }),
    cancel: (requestId: string, advisory?: true) =>
      command({ kind: 'cancel', requestId, ...(advisory ? { advisory } : {}) }),
  };
}
