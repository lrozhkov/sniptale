import {
  sameConnectionScope,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
  type SyncConnectionMetadata,
  type SyncConnectionAuthentication,
  parseSyncWorkspaceSource,
  type SyncWorkspaceSource,
} from '../../composition/persistence/remote-connection/model';
import type { SyncWorkspaceSelection } from '../../composition/persistence/remote-connection/workspace-selection';
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
interface WorkspaceSelection {
  source: SyncWorkspaceSource;
  authentication: SyncConnectionAuthentication;
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
  loadWorkspace(): Promise<SyncWorkspaceSelection | null>;
  revokeWorkspace(source: SyncWorkspaceSource): Promise<void>;
  hasOriginPermission(origin: string): Promise<boolean>;
  enrollConnection(
    source: SyncWorkspaceSource,
    authentication: SyncConnectionAuthentication
  ): Promise<SyncConnectionMetadata>;
  /** Resolve only after durable revocation commits and its native admission lock releases. */
  revokeConnection(identity: SyncConnectionIdentity): Promise<void>;
  ensureDocument(): Promise<string>;
  /** Null selects the existing document, including a surviving document after worker restart. */
  inspectExecutor(startupId: string | null, challenge: string): Promise<Observation>;
  startExecutor(input: StartSelection & ExecutorTarget): Promise<ExecutorReceipt>;
  stopExecutor(target: ExecutorTarget): Promise<ExecutorReceipt>;
  startWorkspaceExecutor(input: WorkspaceSelection & ExecutorTarget): Promise<ExecutorReceipt>;
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
    if (metadata) {
      if (metadata.phase !== 'paused') await deps.revokeConnection(metadata.identity);
      return;
    }
    const workspace = await deps.loadWorkspace();
    if (workspace) await deps.revokeWorkspace(workspace.source);
  }

  async function revokeAndObserve(revoke: () => Promise<void> = revokeCurrent) {
    let failed = false;
    try {
      await revoke();
    } catch {
      failed = true;
    }
    return { snapshot: await observe(null), failed };
  }
  async function finishContainment(result: {
    snapshot: SyncExecutorSnapshot | null;
    failed: boolean;
  }) {
    await contain(result.snapshot);
    if (result.failed) refused();
  }
  function matchesWorkspace(workspace: SyncWorkspaceSelection | null, source: SyncWorkspaceSource) {
    return (
      !!workspace &&
      workspace.phase !== 'allocating' &&
      workspace.source.kind === source.kind &&
      sameSyncConnectionIdentity(workspace.source.identity, source.identity)
    );
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
        if (
          !snapshot ||
          snapshot.phase === 'stopping' ||
          snapshot.phase === 'failed' ||
          snapshot.workspace?.state === 'running'
        )
          refused();
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
    startWorkspace(input: WorkspaceSelection): Promise<ExecutorReceipt> {
      const source = parseSyncWorkspaceSource(structuredClone(input.source));
      let authentication: SyncConnectionAuthentication | null = structuredClone(
        input.authentication
      );
      const release = exclusion.acquirePermit();
      if (!release) return Promise.reject(new Error('Sync coordinator operation refused'));
      const generation = exclusion.getGeneration();
      const checkGeneration = () => {
        if (generation !== exclusion.getGeneration()) refused();
      };
      return enqueue(async () => {
        checkGeneration();
        if (!source || (await deps.loadConnection())) refused();
        if (!matchesWorkspace(await deps.loadWorkspace(), source)) refused();
        checkGeneration();
        const startupId = await deps.ensureDocument();
        checkGeneration();
        const snapshot = await observe(startupId);
        checkGeneration();
        if (
          !snapshot ||
          snapshot.phase === 'stopping' ||
          snapshot.phase === 'failed' ||
          snapshot.jobs.some((job) => job.state === 'running')
        )
          refused();
        if (!matchesWorkspace(await deps.loadWorkspace(), source) || (await deps.loadConnection()))
          refused();
        checkGeneration();
        if (!authentication) refused();
        const receipt = await deps.startWorkspaceExecutor({
          source,
          authentication,
          ...target(snapshot),
        });
        if (
          receipt.executorId !== snapshot.executorId ||
          receipt.executorRevision < snapshot.executorRevision
        )
          refused();
        return receipt;
      }).finally(() => {
        authentication = null;
        release();
      });
    },
    /** Install native ready evidence only after the previous executor acknowledges containment. */
    enrollWorkspace(input: WorkspaceSelection): Promise<SyncConnectionMetadata> {
      const source = parseSyncWorkspaceSource(structuredClone(input.source));
      let authentication: SyncConnectionAuthentication | null = structuredClone(
        input.authentication
      );
      const release = exclusion.acquirePermit();
      if (!release) return Promise.reject(new Error('Sync coordinator operation refused'));
      const generation = exclusion.getGeneration();
      const checkGeneration = () => {
        if (generation !== exclusion.getGeneration()) refused();
      };
      return enqueue(async () => {
        checkGeneration();
        const selected = await deps.loadWorkspace();
        if (!source || !matchesWorkspace(selected, source) || selected?.phase !== 'ready')
          refused();
        checkGeneration();
        const snapshot = await observe(null);
        checkGeneration();
        if (
          snapshot &&
          (snapshot.phase === 'stopping' ||
            snapshot.phase === 'failed' ||
            snapshot.workspace?.state === 'running' ||
            snapshot.jobs.some((job) => job.state === 'running'))
        )
          refused();
        await contain(snapshot);
        checkGeneration();
        const current = await deps.loadWorkspace();
        if (!matchesWorkspace(current, source) || current?.phase !== 'ready') refused();
        if (!(await deps.hasOriginPermission(new URL(current.rootUrl).origin))) refused();
        checkGeneration();
        if (!authentication) refused();
        const connection = await deps.enrollConnection(source, authentication);
        checkGeneration();
        return connection;
      }).finally(() => {
        authentication = null;
        release();
      });
    },
    inspect(): Promise<SyncExecutorSnapshot | null> {
      return enqueue(async () => {
        const snapshot = await observe(null);
        if (!snapshot) return null;
        let metadata: SyncConnectionMetadata | null;
        try {
          metadata = await deps.loadConnection();
        } catch {
          await contain(snapshot);
          refused();
        }
        if (
          snapshot.workspace &&
          (snapshot.workspace.state === 'running' || snapshot.phase === 'failed')
        ) {
          let workspace: SyncWorkspaceSelection | null = null;
          try {
            workspace = await deps.loadWorkspace();
          } catch {
            /* Refuse adoption of uncheckable native state. */
          }
          if (
            metadata ||
            !workspace ||
            workspace.source.kind !== snapshot.workspace.sourceKind ||
            workspace.source.identity.incarnation !== snapshot.workspace.selectionIncarnation
          ) {
            await contain(snapshot);
            refused();
          }
        }
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
          quiescence ??= enqueue(() => revokeAndObserve()).then(finishContainment);
          return quiescence;
        },
      };
    },
    async permissionsRemoved(isAffected: (origin: string) => boolean): Promise<void> {
      const held: { release?: () => void } = {};
      try {
        const result = await enqueue(async () => {
          let metadata: SyncConnectionMetadata | null;
          let workspace: SyncWorkspaceSelection | null;
          try {
            metadata = await deps.loadConnection();
            workspace = metadata ? null : await deps.loadWorkspace();
          } catch {
            const reservation = exclusion.reserveExclusion();
            held.release = reservation.release;
            return revokeAndObserve(async () => {
              refused();
            });
          }
          const origin = metadata
            ? new URL(metadata.binding.rootUrl).origin
            : workspace
              ? new URL(workspace.rootUrl).origin
              : null;
          if (origin && !isAffected(origin)) return { snapshot: null, failed: false };
          const reservation = exclusion.reserveExclusion();
          held.release = reservation.release;
          return revokeAndObserve(async () => {
            if (metadata && metadata.phase !== 'paused')
              await deps.revokeConnection(metadata.identity);
            else if (workspace) await deps.revokeWorkspace(workspace.source);
          });
        });
        await finishContainment(result);
      } finally {
        held.release?.();
      }
    },
  };
}
