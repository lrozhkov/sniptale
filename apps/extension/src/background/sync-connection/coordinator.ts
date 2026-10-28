import type {
  SyncProductWork,
  SyncProductExecutorRequest,
  SyncProductResponse,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
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
  requestId?: string;
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
  inspectExecutor(
    startupId: string | null,
    challenge: string,
    advisory?: true
  ): Promise<Observation>;
  startExecutor(input: StartSelection & ExecutorTarget): Promise<ExecutorReceipt>;
  stopExecutor(target: ExecutorTarget): Promise<ExecutorReceipt>;
  startWorkspaceExecutor(input: WorkspaceSelection & ExecutorTarget): Promise<ExecutorReceipt>;
  createWorkspaceSelection?(
    input:
      | { kind: 'allocation'; parentUrl: string; accountId: string }
      | { kind: 'join'; rootUrl: string; accountId: string }
  ): Promise<SyncWorkspaceSource>;
  productExecutor?(
    input: ExecutorTarget & { command: SyncProductExecutorRequest['command']; advisory?: true }
  ): Promise<SyncProductResponse>;
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

class SyncConnectionCoordinator {
  readonly #deps: SyncConnectionCoordinatorDependencies;

  constructor(deps: SyncConnectionCoordinatorDependencies) {
    this.#deps = deps;
  }

  #exclusion = createGenerationTrackedMutationExclusion();
  #transitions = Promise.resolve();

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#transitions.then(operation);
    this.#transitions = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
  async #observe(startupId: string | null, advisory?: true): Promise<SyncExecutorSnapshot | null> {
    const challenge = this.#deps.createChallenge();
    const observation = await this.#deps.inspectExecutor(
      startupId,
      challenge,
      ...(advisory ? ([advisory] as const) : [])
    );
    if (observation.kind === 'absent') return null;
    if (
      observation.challenge !== challenge ||
      (startupId !== null && observation.snapshot.offscreenStartupId !== startupId)
    )
      refused();
    return observation.snapshot;
  }
  async #contain(snapshot: SyncExecutorSnapshot | null): Promise<void> {
    if (!snapshot) return;
    const receipt = await this.#deps.stopExecutor(target(snapshot));
    if (
      receipt.executorId !== snapshot.executorId ||
      receipt.executorRevision <= snapshot.executorRevision
    )
      refused();
  }
  async #revokeCurrent() {
    const metadata = await this.#deps.loadConnection();
    if (metadata) {
      if (metadata.phase !== 'paused') await this.#deps.revokeConnection(metadata.identity);
      return;
    }
    const workspace = await this.#deps.loadWorkspace();
    if (workspace) await this.#deps.revokeWorkspace(workspace.source);
  }

  async #revokeAndObserve(revoke: () => Promise<void> = () => this.#revokeCurrent()) {
    let failed = false;
    try {
      await revoke();
    } catch {
      failed = true;
    }
    return { snapshot: await this.#observe(null), failed };
  }
  async #finishContainment(result: { snapshot: SyncExecutorSnapshot | null; failed: boolean }) {
    await this.#contain(result.snapshot);
    if (result.failed) refused();
  }
  #matchesWorkspace(workspace: SyncWorkspaceSelection | null, source: SyncWorkspaceSource) {
    return (
      !!workspace &&
      workspace.phase !== 'allocating' &&
      workspace.source.kind === source.kind &&
      sameSyncConnectionIdentity(workspace.source.identity, source.identity)
    );
  }

  /** Retire one exact local setup lifetime; uncertain server folders remain untouched. */
  abandonWorkspace(
    sourceInput: SyncWorkspaceSource
  ): Promise<{ kind: 'cancelled'; outcome: 'cancelled' }> {
    const source = parseSyncWorkspaceSource(structuredClone(sourceInput));
    const release = this.#exclusion.acquirePermit();
    if (!release) return Promise.reject(new Error('Sync coordinator operation refused'));
    const generation = this.#exclusion.getGeneration();
    const checkGeneration = () => {
      if (generation !== this.#exclusion.getGeneration()) refused();
    };
    return this.#enqueue(async () => {
      checkGeneration();
      if (!source || (await this.#deps.loadConnection())) refused();
      const workspace = await this.#deps.loadWorkspace();
      checkGeneration();
      if (
        !workspace ||
        workspace.source.kind !== source.kind ||
        !sameSyncConnectionIdentity(workspace.source.identity, source.identity)
      )
        refused();
      // Incarnation revocation follows exact selection admission and covers in-flight phase advances.
      const result = await this.#revokeAndObserve(() => this.#deps.revokeWorkspace(source));
      await this.#finishContainment(result);
      checkGeneration();
      return { kind: 'cancelled' as const, outcome: 'cancelled' as const };
    }).finally(release);
  }
  planWorkspace(
    input:
      | { kind: 'allocation'; parentUrl: string; accountId: string }
      | { kind: 'join'; rootUrl: string; accountId: string }
  ): Promise<SyncWorkspaceSource> {
    const release = this.#exclusion.acquirePermit();
    if (!release) return Promise.reject(new Error('Sync coordinator operation refused'));
    const generation = this.#exclusion.getGeneration();
    const selected = structuredClone(input);
    return this.#enqueue(async () => {
      if (generation !== this.#exclusion.getGeneration() || !this.#deps.createWorkspaceSelection)
        refused();
      if (await this.#deps.loadConnection()) refused();
      if (generation !== this.#exclusion.getGeneration()) refused();
      const source = await this.#deps.createWorkspaceSelection(selected);
      if (generation !== this.#exclusion.getGeneration()) refused();
      return source;
    }).finally(release);
  }
  async #observeProduct(
    requestId: string,
    kind: 'inspect' | 'cancel',
    consumer: 'settings' | 'gallery' | undefined,
    check: () => void,
    advisory?: true
  ): Promise<SyncProductResponse> {
    const snapshot = await this.#enqueue(async () => {
      check();
      const observed = await this.#observe(null, advisory);
      check();
      return observed;
    });
    const workspaceTarget = snapshot?.workspace?.requestId === requestId;
    const productTarget = snapshot?.products?.find((item) => item.requestId === requestId);
    if (
      (workspaceTarget && consumer === 'gallery') ||
      (productTarget && consumer === 'settings' && productTarget.kind !== 'catalog-refresh')
    )
      refused();
    if (!snapshot || !this.#deps.productExecutor)
      return {
        success: true,
        result:
          kind === 'inspect'
            ? { kind: 'operation', job: null, completion: null }
            : { kind: 'cancelled', outcome: 'refused' },
      };
    if (
      kind === 'cancel' &&
      snapshot.workspace?.requestId === requestId &&
      snapshot.workspace.state === 'running'
    ) {
      const source = await this.#deps.loadWorkspace();
      check();
      if (
        !source ||
        source.source.identity.incarnation !== snapshot.workspace.selectionIncarnation ||
        source.source.kind !== snapshot.workspace.sourceKind
      )
        refused();
      await this.#deps.revokeWorkspace(source.source);
    }
    return await this.#deps.productExecutor({
      ...target(snapshot),
      ...(advisory ? { advisory } : {}),
      command:
        kind === 'inspect'
          ? { kind: 'inspect', operationRequestId: requestId }
          : { kind: 'cancel', operationRequestId: requestId },
    });
  }

  async #startProduct(
    requestId: string,
    work: SyncProductWork,
    check: () => void
  ): Promise<SyncProductResponse> {
    return this.#enqueue(async () => {
      check();
      const metadata = await this.#deps.loadConnection();
      if (!metadata || metadata.phase !== 'active') refused();
      check();
      const startupId = await this.#deps.ensureDocument();
      check();
      const snapshot = await this.#observe(
        startupId,
        work.kind === 'thumbnail-read' ? true : undefined
      );
      check();
      if (
        !snapshot ||
        snapshot.phase === 'stopping' ||
        snapshot.phase === 'failed' ||
        snapshot.workspace?.state === 'running' ||
        !this.#deps.productExecutor
      )
        refused();
      const current = await this.#deps.loadConnection();
      check();
      const selection = {
        scope: {
          spaceId: metadata.binding.spaceId,
          connectionGeneration: metadata.binding.connectionGeneration,
          profileCreatedAt: metadata.binding.profileCreatedAt,
        },
        authorization: metadata.identity,
      };
      if (
        !matches(current, { ...selection, operationId: requestId, expectedRevision: 1 }) ||
        (snapshot.phase !== 'stopped' && !boundToCurrent(snapshot, current))
      )
        refused();
      return this.#deps.productExecutor({
        ...target(snapshot),
        ...(work.kind === 'thumbnail-read' ? { advisory: true as const } : {}),
        command: {
          kind: 'start',
          operationRequestId: requestId,
          binding: selection,
          work,
        },
      });
    });
  }

  async productCommand(
    requestId: string,
    command:
      | SyncProductWork
      | { kind: 'inspect'; advisory?: true }
      | { kind: 'cancel'; advisory?: true },
    consumer?: 'settings' | 'gallery'
  ): Promise<SyncProductResponse> {
    const release = this.#exclusion.acquirePermit();
    if (!release) return { success: false, error: 'Sync product command refused' };
    const generation = this.#exclusion.getGeneration();
    const selected = structuredClone(command);
    const check = () => {
      if (generation !== this.#exclusion.getGeneration()) refused();
    };
    try {
      // Cancellation drains outside the transition queue while privacy can reserve exclusion.
      if (selected.kind === 'inspect' || selected.kind === 'cancel')
        return await this.#observeProduct(
          requestId,
          selected.kind,
          consumer,
          check,
          selected.advisory
        );
      return await this.#startProduct(requestId, selected, check);
    } finally {
      release();
    }
  }

  start(input: StartSelection): Promise<ExecutorReceipt> {
    const release = this.#exclusion.acquirePermit();
    if (!release) return Promise.reject(new Error('Sync coordinator operation refused'));
    const generation = this.#exclusion.getGeneration();
    const selection = structuredClone(input);
    const checkGeneration = () => {
      if (generation !== this.#exclusion.getGeneration()) refused();
    };
    return this.#enqueue(async () => {
      checkGeneration();
      if (!matches(await this.#deps.loadConnection(), selection)) refused();
      checkGeneration();
      const startupId = await this.#deps.ensureDocument();
      checkGeneration();
      const snapshot = await this.#observe(startupId);
      checkGeneration();
      if (
        !snapshot ||
        snapshot.phase === 'stopping' ||
        snapshot.phase === 'failed' ||
        snapshot.workspace?.state === 'running'
      )
        refused();
      const metadata = await this.#deps.loadConnection();
      checkGeneration();
      if (
        !matches(metadata, selection) ||
        (snapshot.phase !== 'stopped' && !boundToCurrent(snapshot, metadata))
      )
        refused();
      const receipt = await this.#deps.startExecutor({ ...selection, ...target(snapshot) });
      if (
        receipt.executorId !== snapshot.executorId ||
        receipt.executorRevision < snapshot.executorRevision
      )
        refused();
      return receipt;
    }).finally(release);
  }
  startWorkspace(input: WorkspaceSelection): Promise<ExecutorReceipt> {
    const source = parseSyncWorkspaceSource(structuredClone(input.source));
    let authentication: SyncConnectionAuthentication | null = structuredClone(input.authentication);
    const release = this.#exclusion.acquirePermit();
    if (!release) return Promise.reject(new Error('Sync coordinator operation refused'));
    const generation = this.#exclusion.getGeneration();
    const checkGeneration = () => {
      if (generation !== this.#exclusion.getGeneration()) refused();
    };
    return this.#enqueue(async () => {
      checkGeneration();
      if (!source || (await this.#deps.loadConnection())) refused();
      if (!this.#matchesWorkspace(await this.#deps.loadWorkspace(), source)) refused();
      checkGeneration();
      const startupId = await this.#deps.ensureDocument();
      checkGeneration();
      const snapshot = await this.#observe(startupId);
      checkGeneration();
      if (
        !snapshot ||
        snapshot.phase === 'stopping' ||
        snapshot.phase === 'failed' ||
        snapshot.jobs.some((job) => job.state === 'running') ||
        snapshot.products?.some((item) => item.state === 'running')
      )
        refused();
      if (
        !this.#matchesWorkspace(await this.#deps.loadWorkspace(), source) ||
        (await this.#deps.loadConnection())
      )
        refused();
      checkGeneration();
      if (!authentication) refused();
      const receipt = await this.#deps.startWorkspaceExecutor({
        source,
        authentication,
        ...(input.requestId ? { requestId: input.requestId } : {}),
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
  }
  /** Install native ready evidence only after the previous executor acknowledges containment. */
  enrollWorkspace(input: WorkspaceSelection): Promise<SyncConnectionMetadata> {
    const source = parseSyncWorkspaceSource(structuredClone(input.source));
    let authentication: SyncConnectionAuthentication | null = structuredClone(input.authentication);
    const release = this.#exclusion.acquirePermit();
    if (!release) return Promise.reject(new Error('Sync coordinator operation refused'));
    const generation = this.#exclusion.getGeneration();
    const checkGeneration = () => {
      if (generation !== this.#exclusion.getGeneration()) refused();
    };
    return this.#enqueue(async () => {
      checkGeneration();
      const selected = await this.#deps.loadWorkspace();
      if (!source || !this.#matchesWorkspace(selected, source) || selected?.phase !== 'ready')
        refused();
      checkGeneration();
      const snapshot = await this.#observe(null);
      checkGeneration();
      if (
        snapshot &&
        (snapshot.phase === 'stopping' ||
          snapshot.phase === 'failed' ||
          snapshot.workspace?.state === 'running' ||
          snapshot.jobs.some((job) => job.state === 'running') ||
          snapshot.products?.some((item) => item.state === 'running'))
      )
        refused();
      await this.#contain(snapshot);
      checkGeneration();
      const current = await this.#deps.loadWorkspace();
      if (!this.#matchesWorkspace(current, source) || current?.phase !== 'ready') refused();
      if (!(await this.#deps.hasOriginPermission(new URL(current.rootUrl).origin))) refused();
      checkGeneration();
      if (!authentication) refused();
      const connection = await this.#deps.enrollConnection(source, authentication);
      checkGeneration();
      return connection;
    }).finally(() => {
      authentication = null;
      release();
    });
  }
  inspect(): Promise<SyncExecutorSnapshot | null> {
    return this.#enqueue(async () => {
      const snapshot = await this.#observe(null);
      if (!snapshot) return null;
      let metadata: SyncConnectionMetadata | null;
      try {
        metadata = await this.#deps.loadConnection();
      } catch {
        await this.#contain(snapshot);
        refused();
      }
      if (
        snapshot.workspace &&
        (snapshot.workspace.state === 'running' || snapshot.phase === 'failed')
      ) {
        let workspace: SyncWorkspaceSelection | null = null;
        try {
          workspace = await this.#deps.loadWorkspace();
        } catch {
          /* Refuse adoption of uncheckable native state. */
        }
        if (
          metadata ||
          !workspace ||
          workspace.source.kind !== snapshot.workspace.sourceKind ||
          workspace.source.identity.incarnation !== snapshot.workspace.selectionIncarnation
        ) {
          await this.#contain(snapshot);
          refused();
        }
      }
      if (!boundToCurrent(snapshot, metadata)) refused();
      return snapshot;
    });
  }
  /** Reserve before entering the privacy queue; release only after that operation settles. */
  reserveErasure() {
    const reservation = this.#exclusion.reserveExclusion();
    let quiescence: Promise<void> | null = null;
    return {
      release: reservation.release,
      quiesce: (): Promise<void> => {
        quiescence ??= this.#enqueue(() => this.#revokeAndObserve()).then((result) =>
          this.#finishContainment(result)
        );
        return quiescence;
      },
    };
  }
  async permissionsRemoved(isAffected: (origin: string) => boolean): Promise<void> {
    const held: { release?: () => void } = {};
    try {
      const result = await this.#enqueue(async () => {
        let metadata: SyncConnectionMetadata | null;
        let workspace: SyncWorkspaceSelection | null;
        try {
          metadata = await this.#deps.loadConnection();
          workspace = metadata ? null : await this.#deps.loadWorkspace();
        } catch {
          const reservation = this.#exclusion.reserveExclusion();
          held.release = reservation.release;
          return this.#revokeAndObserve(async () => {
            refused();
          });
        }
        const origin = metadata
          ? new URL(metadata.binding.rootUrl).origin
          : workspace
            ? new URL(workspace.rootUrl).origin
            : null;
        if (origin && !isAffected(origin)) return { snapshot: null, failed: false };
        const reservation = this.#exclusion.reserveExclusion();
        held.release = reservation.release;
        return this.#revokeAndObserve(async () => {
          if (metadata && metadata.phase !== 'paused')
            await this.#deps.revokeConnection(metadata.identity);
          else if (workspace) await this.#deps.revokeWorkspace(workspace.source);
        });
      });
      await this.#finishContainment(result);
    } finally {
      held.release?.();
    }
  }
}

/** Owns short command transitions; the offscreen executor owns complete workflow promises. */
export function createSyncConnectionCoordinator(deps: SyncConnectionCoordinatorDependencies) {
  const coordinator = new SyncConnectionCoordinator(deps);
  return {
    abandonWorkspace: coordinator.abandonWorkspace.bind(coordinator),
    planWorkspace: coordinator.planWorkspace.bind(coordinator),
    productCommand: coordinator.productCommand.bind(coordinator),
    start: coordinator.start.bind(coordinator),
    startWorkspace: coordinator.startWorkspace.bind(coordinator),
    enrollWorkspace: coordinator.enrollWorkspace.bind(coordinator),
    inspect: coordinator.inspect.bind(coordinator),
    reserveErasure: coordinator.reserveErasure.bind(coordinator),
    permissionsRemoved: coordinator.permissionsRemoved.bind(coordinator),
  };
}
