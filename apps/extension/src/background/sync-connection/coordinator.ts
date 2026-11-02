import {
  parseSyncWorkspaceIdentity,
  type SyncWorkspaceIdentity,
} from '../../contracts/sync-workspace';
import { isSyncWorkspaceDiscoveryPrefix } from '../../contracts/messaging/contracts/runtime/sync-product';
import type {
  SyncExecutorBinding,
  SyncProductFailureCode,
  SyncProductWork,
  SyncProductExecutorRequest,
  SyncProductResponse,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  sameConnectionScope,
  sameConnectionBinding,
  parseSyncConnectionIdentity,
  parseConnectionAuthentication,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
  type SyncConnectionMetadata,
  type SyncStoragePolicy,
  parseSyncStoragePolicy,
  type SyncConnectionAuthentication,
  parseSyncWorkspaceSource,
  type SyncWorkspaceSource,
} from '../../composition/persistence/remote-connection/model';
import type { SyncWorkspaceSelection } from '../../composition/persistence/remote-connection/workspace-selection';
import type { SyncQueueScope } from '../../composition/persistence/sync-capture/queue-model';
import type { SyncExecutorSnapshot } from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import { createGenerationTrackedMutationExclusion } from '../mutation-exclusion/gate';

/** Advisory activity excludes private identities and grants no execution authority. */
export type SyncActivityObservation = {
  activity: 'idle' | 'running' | 'stopping' | 'unknown';
  remote:
    | { knowledge: 'unknown' }
    | { knowledge: 'observed-pass'; outcome: 'complete' | 'deferred' };
  failureCode: SyncProductFailureCode | null;
};

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
  operation?: 'discover';
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
    authentication: SyncConnectionAuthentication,
    storagePolicy: SyncStoragePolicy
  ): Promise<SyncConnectionMetadata>;
  /** Resolve only after durable revocation commits and its native admission lock releases. */
  revokeConnection(identity: SyncConnectionIdentity): Promise<void>;
  beginAuthenticationUpdate?(connection: SyncConnectionMetadata): Promise<SyncConnectionMetadata>;
  commitAuthenticationUpdate?(
    reservation: SyncConnectionMetadata,
    authentication: SyncConnectionAuthentication
  ): Promise<SyncConnectionMetadata>;
  resumeConnection?(expected: SyncConnectionIdentity): Promise<void>;
  completeLocalOnly?(connection: SyncConnectionMetadata): Promise<'delivered' | 'incomplete'>;
  ensureDocument(): Promise<string>;
  /** Null selects the existing document, including a surviving document after worker restart. */
  inspectExecutor(
    startupId: string | null,
    challenge: string,
    advisory?: true
  ): Promise<Observation>;
  startExecutor(input: StartSelection & ExecutorTarget): Promise<ExecutorReceipt>;
  stopExecutor(target: ExecutorTarget & { reason?: 'secrets-locked' }): Promise<ExecutorReceipt>;
  startWorkspaceExecutor(input: WorkspaceSelection & ExecutorTarget): Promise<ExecutorReceipt>;
  createWorkspaceSelection?(
    input:
      | { kind: 'allocation'; parentUrl: string; accountId: string }
      | {
          kind: 'join';
          rootUrl: string;
          accountId: string;
          expected: SyncWorkspaceIdentity | null;
          previous: SyncWorkspaceSource | null;
        }
  ): Promise<SyncWorkspaceSource>;
  productExecutor?(
    input: ExecutorTarget & { command: SyncProductExecutorRequest['command']; advisory?: true }
  ): Promise<SyncProductResponse>;
  createChallenge(): string;
}

/** Fixed owner refusal codes contain no connection or executor identity. */
export class SyncConnectionCoordinatorError extends Error {
  constructor(
    readonly code:
      | 'coordinator-refused'
      | 'privacy-exclusion'
      | 'generation-changed'
      | 'selection-changed'
      | 'executor-unavailable'
      | 'binding-changed'
      | 'receipt-invalid' = 'coordinator-refused'
  ) {
    super('Sync coordinator operation refused');
    this.name = 'SyncConnectionCoordinatorError';
  }
}

function refused(code: SyncConnectionCoordinatorError['code'] = 'coordinator-refused'): never {
  throw new SyncConnectionCoordinatorError(code);
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
  async #contain(snapshot: SyncExecutorSnapshot | null, reason?: 'secrets-locked'): Promise<void> {
    if (!snapshot) return;
    const receipt = await this.#deps.stopExecutor({
      ...target(snapshot),
      ...(reason ? { reason } : {}),
    });
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
  #workspaceOperation<T>(
    input: WorkspaceSelection,
    operation: (
      source: SyncWorkspaceSource | null,
      authentication: SyncConnectionAuthentication | null,
      checkGeneration: () => void
    ) => Promise<T>
  ): Promise<T> {
    const source = parseSyncWorkspaceSource(structuredClone(input.source));
    let authentication: SyncConnectionAuthentication | null = structuredClone(input.authentication);
    const admission = this.#operationPermit();
    if (!admission) return Promise.reject(new Error('Sync coordinator operation refused'));
    return this.#enqueue(async () => {
      admission.checkGeneration();
      return operation(source, authentication, admission.checkGeneration);
    }).finally(() => {
      authentication = null;
      admission.release();
    });
  }
  #operationPermit() {
    const release = this.#exclusion.acquirePermit();
    if (!release) return null;
    const generation = this.#exclusion.getGeneration();
    return {
      release,
      checkGeneration: () => {
        if (generation !== this.#exclusion.getGeneration()) refused();
      },
    };
  }
  async #ensureObserved(checkGeneration: () => void) {
    checkGeneration();
    const startupId = await this.#deps.ensureDocument();
    checkGeneration();
    const snapshot = await this.#observe(startupId);
    checkGeneration();
    return snapshot;
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
    const admission = this.#operationPermit();
    if (!admission) return Promise.reject(new Error('Sync coordinator operation refused'));
    const { release, checkGeneration } = admission;
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
      | { kind: 'join'; rootUrl: string; accountId: string; previous: SyncWorkspaceSource | null }
  ): Promise<SyncWorkspaceSource> {
    const admission = this.#operationPermit();
    if (!admission) return Promise.reject(new Error('Sync coordinator operation refused'));
    const selected = structuredClone(input);
    return this.#enqueue(async () => {
      const check = admission.checkGeneration;
      check();
      if (!this.#deps.createWorkspaceSelection || (await this.#deps.loadConnection())) refused();
      check();
      if (selected.kind === 'join') {
        const current = await this.#deps.loadWorkspace();
        check();
        if (
          selected.previous
            ? !this.#matchesWorkspace(current, selected.previous) ||
              selected.previous.kind !== 'join'
            : current !== null
        )
          refused();
        if (selected.previous) {
          const snapshot = await this.#observe(null);
          check();
          if (
            snapshot?.phase === 'failed' ||
            snapshot?.phase === 'stopping' ||
            snapshot?.workspace?.state === 'running' ||
            snapshot?.jobs.some((job) => job.state === 'running') ||
            snapshot?.products?.some((job) => job.state === 'running')
          )
            refused();
          await this.#contain(snapshot);
          check();
          if (!this.#matchesWorkspace(await this.#deps.loadWorkspace(), selected.previous))
            refused();
          check();
        }
      }
      const source = await this.#deps.createWorkspaceSelection(
        selected.kind === 'join' ? { ...selected, expected: null } : selected
      );
      check();
      return source;
    }).finally(admission.release);
  }
  /** Select only a completed search; native JOIN still validates the selected marker again. */
  selectWorkspace(input: {
    source: SyncWorkspaceSource;
    prefix: string;
    expected: SyncWorkspaceIdentity;
  }): Promise<SyncWorkspaceSource> {
    const detached = structuredClone(input);
    const source = parseSyncWorkspaceSource(detached.source);
    const expected = parseSyncWorkspaceIdentity(detached.expected);
    const admission = this.#operationPermit();
    if (!admission) return Promise.reject(new Error('Sync coordinator operation refused'));
    return this.#enqueue(async () => {
      const check = admission.checkGeneration;
      check();
      if (
        !source ||
        source.kind !== 'join' ||
        !expected ||
        !isSyncWorkspaceDiscoveryPrefix(detached.prefix) ||
        !this.#deps.createWorkspaceSelection ||
        (await this.#deps.loadConnection())
      )
        refused();
      const current = await this.#deps.loadWorkspace();
      check();
      if (!this.#matchesWorkspace(current, source) || current?.phase !== 'checking') refused();
      const snapshot = await this.#observe(null);
      check();
      const job = snapshot?.workspace;
      if (
        !snapshot ||
        snapshot.phase === 'failed' ||
        snapshot.phase === 'stopping' ||
        job?.state !== 'discovered' ||
        job.sourceKind !== 'join' ||
        !sameSyncConnectionIdentity(job.discovery.source.identity, source.identity) ||
        !job.discovery.candidates.some(
          (candidate) =>
            candidate.prefix === detached.prefix &&
            candidate.identity.spaceId === expected.spaceId &&
            candidate.identity.bootstrapId === expected.bootstrapId &&
            candidate.identity.fingerprint === expected.fingerprint
        )
      )
        refused();
      await this.#contain(snapshot);
      check();
      const final = await this.#deps.loadWorkspace();
      check();
      if (
        !this.#matchesWorkspace(final, source) ||
        final?.phase !== 'checking' ||
        final.bindingKey !== current.bindingKey ||
        (await this.#deps.loadConnection())
      )
        refused();
      if (!(await this.#deps.hasOriginPermission(new URL(final.rootUrl).origin))) refused();
      check();
      const rootUrl =
        detached.prefix === ''
          ? final.rootUrl
          : final.rootUrl + encodeURIComponent(detached.prefix.slice(0, -1)) + '/';
      const selected = await this.#deps.createWorkspaceSelection({
        kind: 'join',
        rootUrl,
        accountId: final.accountId,
        expected,
        previous: source,
      });
      check();
      return selected;
    }).finally(admission.release);
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
      (productTarget &&
        consumer === 'settings' &&
        productTarget.kind !== 'catalog-refresh' &&
        productTarget.kind !== 'cache-trim' &&
        productTarget.kind !== 'backup-prepare' &&
        productTarget.kind !== 'scenario-export-prepare' &&
        productTarget.kind !== 'library-backup-prepare' &&
        productTarget.kind !== 'replica-prepare' &&
        productTarget.kind !== 'native-prepare' &&
        productTarget.kind !== 'native-release' &&
        productTarget.kind !== 'conflict-resolve')
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
      if (
        !metadata ||
        metadata.phase !== 'active' ||
        (work.kind === 'library-backup-prepare' &&
          !sameSyncConnectionIdentity(metadata.identity, work.expected))
      )
        refused();
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
    if (!release) return Promise.reject(new SyncConnectionCoordinatorError('privacy-exclusion'));
    const generation = this.#exclusion.getGeneration();
    const selection = structuredClone(input);
    const checkGeneration = () => {
      if (generation !== this.#exclusion.getGeneration()) refused('generation-changed');
    };
    return this.#enqueue(async () => {
      checkGeneration();
      if (!matches(await this.#deps.loadConnection(), selection)) refused('selection-changed');
      const snapshot = await this.#ensureObserved(checkGeneration);
      if (
        !snapshot ||
        snapshot.phase === 'stopping' ||
        snapshot.phase === 'failed' ||
        snapshot.workspace?.state === 'running'
      )
        refused('executor-unavailable');
      const metadata = await this.#deps.loadConnection();
      checkGeneration();
      if (
        !matches(metadata, selection) ||
        (snapshot.phase !== 'stopped' && !boundToCurrent(snapshot, metadata))
      )
        refused('binding-changed');
      const receipt = await this.#deps.startExecutor({ ...selection, ...target(snapshot) });
      if (
        receipt.executorId !== snapshot.executorId ||
        receipt.executorRevision < snapshot.executorRevision
      )
        refused('receipt-invalid');
      return receipt;
    }).finally(release);
  }
  startWorkspace(input: WorkspaceSelection): Promise<ExecutorReceipt> {
    return this.#workspaceOperation(input, async (source, authentication, checkGeneration) => {
      if (!source || (await this.#deps.loadConnection())) refused();
      if (!this.#matchesWorkspace(await this.#deps.loadWorkspace(), source)) refused();
      const snapshot = await this.#ensureObserved(checkGeneration);
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
        ...(input.operation ? { operation: input.operation } : {}),
        ...target(snapshot),
      });
      if (
        receipt.executorId !== snapshot.executorId ||
        receipt.executorRevision < snapshot.executorRevision
      )
        refused();
      return receipt;
    });
  }
  /** Install native ready evidence only after the previous executor acknowledges containment. */
  enrollWorkspace(
    input: WorkspaceSelection & { storagePolicy: SyncStoragePolicy }
  ): Promise<SyncConnectionMetadata> {
    const storagePolicy = parseSyncStoragePolicy(structuredClone(input.storagePolicy));
    if (!storagePolicy) return Promise.reject(new Error('Sync coordinator operation refused'));
    return this.#workspaceOperation(input, async (source, authentication, checkGeneration) => {
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
      const connection = await this.#deps.enrollConnection(source, authentication, storagePolicy);
      checkGeneration();
      return connection;
    });
  }
  #connectionOperation<T>(
    expected: SyncConnectionIdentity | null,
    operation: (
      current: SyncConnectionMetadata,
      identity: SyncConnectionIdentity,
      checkGeneration: () => void
    ) => Promise<T>,
    finalize?: () => void
  ): Promise<T> {
    const admission = this.#operationPermit();
    if (!admission) return Promise.reject(new Error('Sync coordinator operation refused'));
    return this.#enqueue(async () => {
      admission.checkGeneration();
      const current = await this.#deps.loadConnection();
      admission.checkGeneration();
      if (!expected || !current || !sameSyncConnectionIdentity(current.identity, expected))
        refused();
      return operation(current, expected, admission.checkGeneration);
    }).finally(() => {
      try {
        finalize?.();
      } finally {
        admission.release();
      }
    });
  }
  /** Resume the native authorization without changing the independent queue pause. */
  resumeConnection(expectedInput: SyncConnectionIdentity): Promise<void> {
    const expected = parseSyncConnectionIdentity(structuredClone(expectedInput));
    return this.#connectionOperation(expected, async (current, identity, checkGeneration) => {
      if (current.phase !== 'paused' || !this.#deps.resumeConnection) refused();
      if (!(await this.#deps.hasOriginPermission(new URL(current.binding.rootUrl).origin)))
        refused();
      checkGeneration();
      await this.#contain(await this.#observe(null));
      checkGeneration();
      await this.#deps.resumeConnection(identity);
      checkGeneration();
    });
  }
  /** Replace credentials only for the selected lifetime, after the old executor drains. */
  updateAuthentication(
    expectedInput: SyncConnectionIdentity,
    authenticationInput: SyncConnectionAuthentication
  ): Promise<void> {
    const expected = parseSyncConnectionIdentity(structuredClone(expectedInput));
    let authentication: SyncConnectionAuthentication | null = structuredClone(authenticationInput);
    return this.#connectionOperation(
      expected,
      async (current, _identity, checkGeneration) => {
        if (!this.#deps.beginAuthenticationUpdate || !this.#deps.commitAuthenticationUpdate)
          refused();
        const parsed = parseConnectionAuthentication(authentication, current.binding.accountId);
        if (
          !parsed ||
          !(await this.#deps.hasOriginPermission(new URL(current.binding.rootUrl).origin))
        )
          refused();
        checkGeneration();
        const reservation = await this.#deps.beginAuthenticationUpdate(current);
        await this.#contain(await this.#observe(null));
        checkGeneration();
        await this.#deps.commitAuthenticationUpdate(reservation, parsed);
        checkGeneration();
      },
      () => {
        authentication = null;
      }
    );
  }
  /** Retire one exact connection only after native revocation and observed executor drain. */
  async localOnly(expectedInput: SyncConnectionIdentity): Promise<'delivered' | 'incomplete'> {
    const expected = parseSyncConnectionIdentity(structuredClone(expectedInput));
    if (!expected || !this.#deps.completeLocalOnly) refused();
    const exclusion = this.#exclusion.reserveExclusion();
    try {
      const selected = await this.#enqueue(async () => {
        const current = await this.#deps.loadConnection();
        if (
          !current ||
          current.phase === 'updating-auth' ||
          !sameSyncConnectionIdentity(current.identity, expected)
        )
          refused();
        const binding = structuredClone(current.binding);
        const revision = expected.revision + (current.phase === 'paused' ? 0 : 1);
        if (current.phase !== 'paused') await this.#deps.revokeConnection(current.identity);
        const paused = await this.#deps.loadConnection();
        if (
          !paused ||
          paused.phase !== 'paused' ||
          paused.identity.incarnation !== expected.incarnation ||
          paused.identity.revision !== revision ||
          !sameConnectionBinding(paused.binding, binding)
        )
          refused();
        return { paused: structuredClone(paused), snapshot: await this.#observe(null) };
      });
      await this.#contain(selected.snapshot);
      return await this.#enqueue(async () => {
        const current = await this.#deps.loadConnection();
        if (
          !current ||
          current.phase !== 'paused' ||
          !sameSyncConnectionIdentity(current.identity, selected.paused.identity) ||
          !sameConnectionBinding(current.binding, selected.paused.binding)
        )
          refused();
        return this.#deps.completeLocalOnly!(current);
      });
    } finally {
      exclusion.release();
    }
  }
  /** Observe an existing executor without native initialization or lifecycle commands. */
  async observeActivity(expectedInput: SyncExecutorBinding): Promise<SyncActivityObservation> {
    const unknown: SyncActivityObservation = {
      activity: 'unknown',
      remote: { knowledge: 'unknown' },
      failureCode: null,
    };
    const release = this.#exclusion.acquirePermit();
    if (!release) return unknown;
    const generation = this.#exclusion.getGeneration();
    release();
    const expected = structuredClone(expectedInput);
    const isCurrent = (snapshot: SyncExecutorSnapshot | null): snapshot is SyncExecutorSnapshot =>
      generation === this.#exclusion.getGeneration() &&
      !!snapshot?.binding &&
      sameConnectionScope(snapshot.binding.scope, expected.scope) &&
      sameSyncConnectionIdentity(snapshot.binding.authorization, expected.authorization);
    const activity = (snapshot: SyncExecutorSnapshot): SyncActivityObservation['activity'] => {
      if (snapshot.phase === 'stopping') return 'stopping';
      if (snapshot.phase === 'failed') return 'unknown';
      if (
        snapshot.jobs.some((job) => job.state === 'running') ||
        snapshot.workspace?.state === 'running' ||
        snapshot.products?.some((job) => job.kind !== 'thumbnail-read' && job.state === 'running')
      )
        return 'running';
      return snapshot.phase === 'idle' || snapshot.phase === 'stopped' ? 'idle' : 'unknown';
    };
    try {
      const observed = await this.#observe(null, true);
      if (!isCurrent(observed)) return unknown;
      const snapshot = structuredClone(observed);
      const result: SyncActivityObservation = { ...unknown, activity: activity(snapshot) };
      if (result.activity === 'unknown' || result.activity === 'stopping') return result;
      const latest = snapshot.products?.findLast((job) => job.kind === 'automatic-sync');
      if (latest?.state === 'failed' || latest?.state === 'interrupted')
        result.failureCode =
          latest.failureCode ?? (latest.state === 'interrupted' ? 'interrupted' : 'internal');
      if (result.activity !== 'idle' || latest?.state !== 'ready' || !this.#deps.productExecutor)
        return result;
      const response = await this.#deps.productExecutor({
        ...target(snapshot),
        command: { kind: 'inspect', operationRequestId: latest.requestId },
        advisory: true,
      });
      if (generation !== this.#exclusion.getGeneration()) return unknown;
      if (!response.success) return unknown;
      if (response.result.kind !== 'operation') return result;
      const { job, completion } = response.result;
      if (
        !job ||
        job.requestId !== latest.requestId ||
        job.kind !== 'automatic-sync' ||
        job.state !== latest.state ||
        completion?.kind !== 'automatic'
      )
        return result;
      const current = await this.#observe(null, true);
      if (!isCurrent(current)) return unknown;
      const currentLatest = current.products?.findLast(
        (candidate) => candidate.kind === 'automatic-sync'
      );
      if (
        current.offscreenStartupId !== snapshot.offscreenStartupId ||
        current.executorId !== snapshot.executorId ||
        current.executorRevision !== snapshot.executorRevision ||
        current.phase !== snapshot.phase ||
        activity(current) !== 'idle' ||
        currentLatest?.requestId !== latest.requestId ||
        currentLatest.state !== latest.state
      )
        return unknown;
      return {
        ...result,
        remote: {
          knowledge: 'observed-pass',
          outcome: completion.remaining || completion.deferred > 0 ? 'deferred' : 'complete',
        },
      };
    } catch {
      return unknown;
    }
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
      const stopped =
        snapshot.phase === 'stopped' &&
        snapshot.jobs.every((job) => job.state !== 'running') &&
        snapshot.workspace?.state !== 'running' &&
        !snapshot.products?.some((job) => job.state === 'running');
      // Read-only status can describe a contained old executor after its namespace was retired.
      if (!stopped && !boundToCurrent(snapshot, metadata)) refused();
      return snapshot;
    });
  }
  /** Close executor work without changing the user's durable pause selection. */
  async containForSecretProtection(): Promise<void> {
    const reservation = this.#exclusion.reserveExclusion();
    try {
      await this.#enqueue(async () => this.#contain(await this.#observe(null), 'secrets-locked'));
    } finally {
      reservation.release();
    }
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
    selectWorkspace: coordinator.selectWorkspace.bind(coordinator),
    productCommand: coordinator.productCommand.bind(coordinator),
    start: coordinator.start.bind(coordinator),
    startWorkspace: coordinator.startWorkspace.bind(coordinator),
    enrollWorkspace: coordinator.enrollWorkspace.bind(coordinator),
    inspect: coordinator.inspect.bind(coordinator),
    observeActivity: coordinator.observeActivity.bind(coordinator),
    updateAuthentication: coordinator.updateAuthentication.bind(coordinator),
    resumeConnection: coordinator.resumeConnection.bind(coordinator),
    localOnly: coordinator.localOnly.bind(coordinator),
    reserveErasure: coordinator.reserveErasure.bind(coordinator),
    containForSecretProtection: coordinator.containForSecretProtection.bind(coordinator),
    permissionsRemoved: coordinator.permissionsRemoved.bind(coordinator),
  };
}
