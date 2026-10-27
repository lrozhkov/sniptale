import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
  type SyncConnectionMetadata,
} from '../../composition/persistence/remote-connection/model';
import type { SyncQueueScope } from '../../composition/persistence/sync-capture/queue-model';
import type { SyncExecutorSnapshot } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createGenerationTrackedMutationExclusion } from '../mutation-exclusion/gate';

interface ExecutorTarget {
  offscreenStartupId: string;
  executorId: string;
  executorRevision: number;
}
interface StartSelection {
  scope: SyncQueueScope;
  authorization: SyncConnectionIdentity;
  operationId: string;
  expectedRevision: number;
}
interface ExecutorReceipt {
  executorId: string;
  executorRevision: number;
}
type Observation =
  | { kind: 'absent' }
  | { kind: 'present'; challenge: string; snapshot: SyncExecutorSnapshot };

/** The gateway establishes document identity and positive absence; transport failure must reject. */
export interface SyncConnectionCoordinatorDependencies {
  loadConnection(): Promise<SyncConnectionMetadata | null>;
  /** Resolve only after durable revocation commits and its native admission lock releases. */
  revokeConnection(identity: SyncConnectionIdentity): Promise<void>;
  ensureDocument(): Promise<string>;
  /** Null selects the existing document, including a surviving document after worker restart. */
  inspectExecutor(startupId: string | null, challenge: string): Promise<Observation>;
  startExecutor(input: StartSelection & ExecutorTarget): Promise<ExecutorReceipt>;
  stopExecutor(target: ExecutorTarget): Promise<ExecutorReceipt>;
  createChallenge(): string;
}

function refused(): never {
  throw new Error('Sync coordinator operation refused');
}
function matches(metadata: SyncConnectionMetadata | null, selection: StartSelection): boolean {
  return (
    !!metadata &&
    metadata.phase === 'active' &&
    sameConnectionScope(metadata.binding, selection.scope) &&
    sameSyncConnectionIdentity(metadata.identity, selection.authorization)
  );
}
function target(snapshot: SyncExecutorSnapshot): ExecutorTarget {
  return {
    offscreenStartupId: snapshot.offscreenStartupId,
    executorId: snapshot.executorId,
    executorRevision: snapshot.executorRevision,
  };
}
function boundToCurrent(snapshot: SyncExecutorSnapshot, metadata: SyncConnectionMetadata | null) {
  return (
    snapshot.binding === null ||
    (!!metadata &&
      metadata.phase === 'active' &&
      sameConnectionScope(snapshot.binding.scope, metadata.binding) &&
      sameSyncConnectionIdentity(snapshot.binding.authorization, metadata.identity))
  );
}

/** Owns short command transitions; the offscreen executor owns complete workflow promises. */
export function createSyncConnectionCoordinator(deps: SyncConnectionCoordinatorDependencies) {
  const exclusion = createGenerationTrackedMutationExclusion();
  let transitions = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = transitions.then(operation);
    transitions = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
  async function observe(startupId: string | null): Promise<SyncExecutorSnapshot | null> {
    const challenge = deps.createChallenge();
    const observation = await deps.inspectExecutor(startupId, challenge);
    if (observation.kind === 'absent') return null;
    if (
      observation.challenge !== challenge ||
      (startupId !== null && observation.snapshot.offscreenStartupId !== startupId)
    )
      refused();
    return observation.snapshot;
  }
  async function contain(snapshot: SyncExecutorSnapshot | null): Promise<void> {
    if (!snapshot) return;
    const receipt = await deps.stopExecutor(target(snapshot));
    if (
      receipt.executorId !== snapshot.executorId ||
      receipt.executorRevision <= snapshot.executorRevision
    )
      refused();
  }
  async function revokeCurrent() {
    const metadata = await deps.loadConnection();
    if (metadata && metadata.phase !== 'paused') await deps.revokeConnection(metadata.identity);
  }

  return {
    start(input: StartSelection): Promise<ExecutorReceipt> {
      const release = exclusion.acquirePermit();
      if (!release) return Promise.reject(new Error('Sync coordinator operation refused'));
      const generation = exclusion.getGeneration();
      const selection = structuredClone(input);
      const checkGeneration = () => {
        if (generation !== exclusion.getGeneration()) refused();
      };
      return enqueue(async () => {
        checkGeneration();
        if (!matches(await deps.loadConnection(), selection)) refused();
        checkGeneration();
        const startupId = await deps.ensureDocument();
        checkGeneration();
        const snapshot = await observe(startupId);
        checkGeneration();
        if (!snapshot || snapshot.phase === 'stopping' || snapshot.phase === 'failed') refused();
        const metadata = await deps.loadConnection();
        checkGeneration();
        if (
          !matches(metadata, selection) ||
          (snapshot.phase !== 'stopped' && !boundToCurrent(snapshot, metadata))
        )
          refused();
        const receipt = await deps.startExecutor({ ...selection, ...target(snapshot) });
        if (
          receipt.executorId !== snapshot.executorId ||
          receipt.executorRevision < snapshot.executorRevision
        )
          refused();
        return receipt;
      }).finally(release);
    },
    inspect(): Promise<SyncExecutorSnapshot | null> {
      return enqueue(async () => {
        const snapshot = await observe(null);
        if (!snapshot) return null;
        const metadata = await deps.loadConnection();
        if (!boundToCurrent(snapshot, metadata)) refused();
        return snapshot;
      });
    },
    /** Reserve before entering the privacy queue; release only after that operation settles. */
    reserveErasure() {
      const reservation = exclusion.reserveExclusion();
      let quiescence: Promise<void> | null = null;
      return {
        release: reservation.release,
        quiesce(): Promise<void> {
          quiescence ??= enqueue(async () => {
            await revokeCurrent();
            return observe(null);
          }).then(contain);
          return quiescence;
        },
      };
    },
    async permissionsRemoved(isAffected: (origin: string) => boolean): Promise<void> {
      const held: { release?: () => void } = {};
      try {
        const snapshot = await enqueue(async () => {
          const metadata = await deps.loadConnection();
          if (!metadata || !isAffected(new URL(metadata.binding.rootUrl).origin)) return null;
          const reservation = exclusion.reserveExclusion();
          held.release = reservation.release;
          if (metadata.phase !== 'paused') await deps.revokeConnection(metadata.identity);
          return observe(null);
        });
        await contain(snapshot);
      } finally {
        held.release?.();
      }
    },
  };
}
