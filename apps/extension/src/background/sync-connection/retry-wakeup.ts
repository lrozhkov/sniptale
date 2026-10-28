import { createLogger } from '@sniptale/platform/observability/logger';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  SyncConnectionMetadata,
  SyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import type { reconcileSyncQueueCaptures } from '../../composition/persistence/sync-capture/queue-reconciliation';
import type {
  SyncQueueScope,
  SyncQueueScheduleProgress,
} from '../../composition/persistence/sync-capture/queue-model';
import type {
  loadSyncQueueScheduleProgress,
  initializeSyncQueueSchedulePage,
  discoverDueSyncQueueOperations,
  deferDueSyncQueueOperation,
  SyncQueueDueCandidate,
} from '../../composition/persistence/sync-capture/queue-schedule';
import type { recoverInterruptedSyncQueueOperation } from '../../workflows/sync-transfer/queue';
import type { createSyncConnectionCoordinator } from './coordinator';

const ALARM = 'sniptale:sync-queue-retry';
const logger = createLogger({ namespace: 'SyncQueueRetry' });

/** Native scheduling and the existing coordinator retain all durable admission authority. */
export interface SyncQueueRetryWakeupDependencies {
  loadConnection(): Promise<SyncConnectionMetadata | null>;
  reconcileCaptures: typeof reconcileSyncQueueCaptures;
  refreshIncoming?: () => Promise<void>;
  discoverInitialRoots?(
    scope: SyncQueueScope,
    authorization: SyncConnectionIdentity
  ): Promise<{
    captured: number;
    existing: number;
    refused: number;
    remaining: boolean;
    advanced?: true;
  }>;
  loadProgress: typeof loadSyncQueueScheduleProgress;
  initializePage: typeof initializeSyncQueueSchedulePage;
  discoverDue: typeof discoverDueSyncQueueOperations;
  deferDue: typeof deferDueSyncQueueOperation;
  recoverInterrupted: typeof recoverInterruptedSyncQueueOperation;
  coordinator: Pick<ReturnType<typeof createSyncConnectionCoordinator>, 'inspect' | 'start'>;
  getAlarm(name: string): Promise<unknown>;
  createAlarm(name: string, options: { periodInMinutes: number }): Promise<void>;
  subscribeAlarm(listener: (value: unknown) => void): () => void;
  subscribeStartup(listener: () => void): () => void;
  subscribeQueueSettled?(listener: () => void): () => void;
}

/** Register a bounded wake-up pass. Disposal preserves the alarm and native work for restart. */
export function createSyncQueueRetryWakeup(deps: SyncQueueRetryWakeupDependencies) {
  let disposed = false;
  let pending: Promise<void> | null = null;
  let followupPending = false;

  async function dispatch(candidate: SyncQueueDueCandidate): Promise<boolean> {
    const snapshot = await deps.coordinator.inspect();
    if (disposed) return false;
    if (
      snapshot?.jobs.some(
        (job) => job.state === 'running' && job.operationId === candidate.operationId
      )
    ) {
      // Start acknowledges before native admission. Preserve that pending claim's due time.
      if (candidate.status === 'running') await deps.deferDue(candidate);
      return false;
    }
    const slotsFull =
      snapshot && snapshot.jobs.filter((job) => job.state === 'running').length >= 2;
    if (snapshot?.phase === 'running' && slotsFull && candidate.status === 'queued') return false;
    if (
      snapshot &&
      (snapshot.phase === 'failed' ||
        snapshot.phase === 'stopping' ||
        snapshot.workspace?.state === 'running' ||
        snapshot.jobs.filter((job) => job.state === 'running').length >= 2)
    ) {
      await deps.deferDue(candidate);
      return false;
    }
    if (candidate.status === 'running') {
      const result = await deps.recoverInterrupted(
        candidate.scope,
        candidate.operationId,
        candidate.revision
      );
      if (!disposed && result.status === 'busy') await deps.deferDue(candidate);
      // Recovery records a new native deadline. This obsolete candidate cannot start that run.
      return true;
    }
    await deps.coordinator.start({
      scope: candidate.scope,
      authorization: candidate.authorization,
      operationId: candidate.operationId,
      expectedRevision: candidate.revision,
    });
    return true;
  }

  async function initialize(
    connection: SyncConnectionMetadata
  ): Promise<SyncQueueScheduleProgress | null> {
    const { spaceId, connectionGeneration, profileCreatedAt } = connection.binding;
    const scope = { spaceId, connectionGeneration, profileCreatedAt };
    let progress = await deps.loadProgress(scope, connection.identity);
    for (let page = 0; page < 2 && !disposed && !progress?.complete; page++) {
      progress = await deps.initializePage(
        scope,
        connection.identity,
        progress?.revision ?? null,
        64
      );
    }
    return progress;
  }

  async function pass(): Promise<void> {
    const alarm = await deps.getAlarm(ALARM);
    if (disposed) return;
    if (!isRecord(alarm) || alarm['periodInMinutes'] !== 1)
      await deps.createAlarm(ALARM, { periodInMinutes: 1 });
    if (disposed) return;
    const connection = await deps.loadConnection();
    if (disposed) return;
    if (!connection || connection.phase !== 'active') return;
    const { spaceId, connectionGeneration, profileCreatedAt } = connection.binding;
    const scope = { spaceId, connectionGeneration, profileCreatedAt };
    let initialRemaining = false;
    if (connection.workspace) {
      try {
        const initial = await deps.discoverInitialRoots?.(scope, connection.identity);
        if (disposed) return;
        initialRemaining = initial?.remaining ?? false;
        if (initial && initial.refused > 0)
          logger.warn('Sync initial discovery contains unsupported roots');
        if (
          initial?.remaining &&
          initial.refused === 0 &&
          (initial.captured + initial.existing > 0 || initial.advanced === true)
        )
          followupPending = true;
      } catch {
        logger.warn('Sync initial discovery deferred');
      }
      if (disposed) return;
      try {
        const result = await deps.reconcileCaptures(scope, connection.identity);
        if (result.refused > 0) logger.warn('Sync capture enqueue deferred');
      } catch {
        // Committed queued work retains independent native admission after discovery failure.
        logger.warn('Sync capture enqueue deferred');
      }
    }
    if (disposed) return;
    if (!initialRemaining && deps.refreshIncoming) {
      try {
        await deps.refreshIncoming();
      } catch {
        logger.warn('Sync incoming refresh deferred');
      }
    }
    if (disposed) return;
    await initialize(connection);
    if (disposed) return;
    let dispatches = 0;
    for (let page = 0; page < 2 && !disposed; page++) {
      const result = await deps.discoverDue(scope, connection.identity, 16);
      for (const candidate of result.candidates) {
        if (disposed) return;
        if (dispatches >= 2) break;
        // A refused candidate cannot suppress later entries in the durable discovery cursor.
        try {
          if (await dispatch(candidate)) dispatches++;
        } catch {
          dispatches++;
          logger.warn('Sync queue retry deferred');
        }
      }
      if (result.progress.dueAfter === null) return;
    }
  }

  function run(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    pending = pass()
      .catch(() => logger.warn('Sync queue retry deferred'))
      .finally(() => {
        pending = null;
        if (followupPending && !disposed) {
          followupPending = false;
          void run();
        }
      });
    return pending;
  }
  const unsubscribe = deps.subscribeAlarm((value) => {
    if (isRecord(value) && value['name'] === ALARM) void run();
  });
  const unsubscribeStartup = deps.subscribeStartup(() => {
    void run();
  });
  const unsubscribeQueue = deps.subscribeQueueSettled?.(() => {
    if (disposed) return;
    if (pending) followupPending = true;
    else void run();
  });
  return {
    run,
    dispose(): void {
      disposed = true;
      unsubscribe();
      unsubscribeStartup();
      unsubscribeQueue?.();
    },
  };
}
