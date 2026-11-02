import type { SyncCheckpointInterval } from '../../../../composition/persistence/sync-capture/contracts';
import {
  readRetainedNativePresence,
  type RetainedLibraryPlan,
} from '../../../../workflows/sync-transfer/retained-library';
import type { createSyncProductClient } from '../../../../platform/runtime-messaging/sync-product-client';
import type {
  SyncProductResult,
  SyncProductStatus,
  SyncWorkspaceDiscovery,
} from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';

type Authentication = { kind: 'basic'; username: string; password: string };
type Message =
  | 'connectionResumed'
  | 'credentialsSaved'
  | 'serverAccessGranted'
  | 'failed'
  | 'checkpointSaved'
  | 'checkpointQueued'
  | 'checkpointChecked'
  | 'checkpointFailed'
  | 'refreshing'
  | 'refreshed'
  | 'invalidUrl'
  | 'permissionDenied'
  | 'abandonFailed'
  | 'localOnlyReady'
  | 'localOnlyFailed'
  | 'localOnlyPending'
  | 'localOnlyCancelled'
  | 'localOnlySyncNotReady'
  | 'localOnlyReadyHistoryGap';

/** Safe display state; transient authentication is never retained by the controller. */
export interface SyncConnectionViewState {
  status: SyncProductStatus | null;
  checkpointInterval: SyncCheckpointInterval | null;
  discovery: SyncWorkspaceDiscovery | null;
  setupInvalidated: boolean;
  localPresence: 'loading' | 'present' | 'empty' | 'unavailable';
  busy: boolean;
  message: Message | null;
  catalogJob: string | null;
  localOnly: { plan: RetainedLibraryPlan; phase: 'confirm' | 'preparing' | 'cancelling' } | null;
}

interface Ports {
  client: ReturnType<typeof createSyncProductClient>;
  requestPermission: (origin: string) => Promise<boolean>;
  ensureUnlocked?: () => Promise<void>;
  readLocalPresence?: () => Promise<boolean>;
  onChange: (state: SyncConnectionViewState) => void;
}
interface ConnectionInput {
  mode: 'create' | 'join';
  url: string;
  account: string;
  username: string;
  password: string;
}

function selectedWorkspaceOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      value.includes('?') ||
      value.includes('#') ||
      !parsed.pathname.endsWith('/') ||
      parsed.href !== value
    )
      return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function sameSource(
  left: NonNullable<SyncProductStatus['workspace']>['source'],
  right: NonNullable<SyncProductStatus['workspace']>['source']
): boolean {
  return (
    left.kind === right.kind &&
    left.identity.incarnation === right.identity.incarnation &&
    left.identity.revision === right.identity.revision
  );
}

class SyncConnectionController {
  private state: SyncConnectionViewState = {
    status: null,
    checkpointInterval: null,
    discovery: null,
    setupInvalidated: false,
    localPresence: 'loading',
    busy: false,
    message: null,
    catalogJob: null,
    localOnly: null,
  };
  private active = false;
  private presenceSourceKey: string | null = null;
  private presenceRevision = 0;
  private readonly readLocalPresence: () => Promise<boolean>;
  private localOnlyAbort: AbortController | null = null;
  private statusRevision = 0;
  private workspaceAccepted = false;
  private setupGeneration = 0;
  private setupEdited = false;
  private containmentFailed = false;
  private workspaceRequestId: string | null = null;
  private fallback: ReturnType<typeof setInterval> | undefined;
  private catalogWaiter: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly refreshStatus = () => {
    if (!this.state.busy) void this.readStatus();
  };
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.refreshStatus();
  };

  constructor(private readonly ports: Ports) {
    this.readLocalPresence = ports.readLocalPresence ?? readRetainedNativePresence;
  }

  activate(): void {
    this.active = true;
    this.unsubscribe = this.ports.client.subscribeToWorkspaceSettled(this.refreshStatus);
    window.addEventListener('focus', this.refreshStatus);
    document.addEventListener('visibilitychange', this.onVisible);
    this.refreshStatus();
    this.updateFallback();
  }

  dispose(): void {
    this.active = false;
    ++this.presenceRevision;
    this.presenceSourceKey = null;
    this.state = { ...this.state, localPresence: 'loading' };
    ++this.statusRevision;
    ++this.setupGeneration;
    const requestId =
      this.workspaceRequestId ??
      (this.state.status?.workspaceJob?.state === 'running'
        ? this.state.status.workspaceJob.requestId
        : undefined);
    if (requestId) void this.ports.client.cancel(requestId).catch(() => undefined);
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.removeEventListener('focus', this.refreshStatus);
    document.removeEventListener('visibilitychange', this.onVisible);
    clearInterval(this.fallback);
    this.fallback = undefined;
    this.localOnlyAbort?.abort();
    this.catalogWaiter?.abort();
    this.catalogWaiter = null;
  }

  updateAuthentication(authentication: Authentication, onSaved: () => void): Promise<void> {
    const connection = this.state.status?.connection;
    if (!connection) return Promise.resolve();
    return this.execute(async () => {
      await this.ports.ensureUnlocked?.();
      if (!this.active) return;
      let result: SyncProductResult;
      try {
        result = await this.ports.client.updateConnectionAuthentication({
          expected: connection.expected,
          authentication,
        });
      } catch {
        // A failed commit can leave a new native reservation. Retry must use its fresh identity.
        await this.readStatus();
        throw new Error('Credential update refused');
      }
      if (!this.active) return;
      if (result.kind !== 'status') throw new Error('Credential update refused');
      this.applyStatus(result.status);
      onSaved();
      this.publish({ message: 'credentialsSaved' });
    });
  }

  resumeConnection(): Promise<void> {
    const connection = this.state.status?.connection;
    if (!connection || connection.phase !== 'paused') return Promise.resolve();
    return this.execute(async () => {
      await this.ports.ensureUnlocked?.();
      if (!this.active) return;
      try {
        const result = await this.ports.client.resumeConnection(connection.expected);
        if (!this.active) return;
        if (result.kind !== 'status') throw new Error('Connection resume refused');
        this.applyStatus(result.status);
        this.publish({ message: 'connectionResumed' });
      } catch {
        await this.readStatus();
        throw new Error('Connection resume refused');
      }
    });
  }

  grantServerAccess(): Promise<void> {
    const connection = this.state.status?.connection;
    if (!connection) return Promise.resolve();
    return this.execute(async () => {
      if (!(await this.requestPermission(connection.rootUrl))) return;
      const current = this.state.status?.connection;
      if (
        !current ||
        current.expected.incarnation !== connection.expected.incarnation ||
        current.expected.revision !== connection.expected.revision
      )
        return;
      await this.readStatus();
      if (this.active) this.publish({ message: 'serverAccessGranted' });
    });
  }

  invalidateSetup(): void {
    ++this.setupGeneration;
    ++this.statusRevision;
    this.setupEdited = true;
    const keepReady =
      this.state.status?.workspace?.phase === 'ready' && !this.state.setupInvalidated;
    this.publish({
      discovery: null,
      setupInvalidated: !keepReady && Boolean(this.state.status?.workspace || this.state.busy),
    });
    if (!this.state.busy && this.state.status?.workspaceJob?.state === 'running')
      void this.abandon();
  }

  async selectCreate(): Promise<boolean> {
    if (this.state.busy) return false;
    const generation = this.setupGeneration;
    const hadWorkspace = Boolean(this.state.status?.workspace);
    if (hadWorkspace) await this.abandon();
    return (
      this.setupGeneration === generation + (hadWorkspace ? 1 : 0) &&
      this.active &&
      !this.state.status?.workspace &&
      !this.state.status?.connection
    );
  }

  connect(input: ConnectionInput, onEnrolled: () => void): Promise<void> {
    const generation = this.setupGeneration;
    return this.execute(async () => {
      const workspace = this.state.status?.workspace;
      if (this.containmentFailed) {
        this.publish({ message: 'abandonFailed' });
        return;
      }
      if (
        workspace &&
        (input.mode === 'create' ||
          workspace.source.kind !== 'join' ||
          this.state.status?.workspaceJob?.state === 'running')
      )
        return;
      const url = input.url.trim();
      const accountId = input.account.trim();
      if (!(await this.requestPermission(url)) || generation !== this.setupGeneration) return;
      this.setupEdited = false;
      this.publish({ discovery: null, setupInvalidated: false });
      const authentication: Authentication = {
        kind: 'basic',
        username: input.username,
        password: input.password,
      };
      const result =
        input.mode === 'create'
          ? await this.ports.client.createWorkspace({ parentUrl: url, accountId, authentication })
          : await this.ports.client.discoverWorkspace({
              rootUrl: url,
              accountId,
              authentication,
              previous: workspace?.source ?? null,
            });
      await this.receiveWorkspaceResult(result, onEnrolled, generation);
    });
  }

  selectWorkspace(index: number, authentication: Authentication): Promise<void> {
    const discovery = this.state.discovery;
    const candidate = discovery?.candidates[index];
    const workspace = this.state.status?.workspace;
    if (!discovery || !candidate || !workspace || !sameSource(workspace.source, discovery.source))
      return Promise.resolve();
    const generation = this.setupGeneration;
    return this.execute(async () => {
      if (
        !(await this.requestPermission(workspace.rootUrl)) ||
        generation !== this.setupGeneration ||
        this.state.discovery !== discovery
      )
        return;
      this.publish({ discovery: null });
      const result = await this.ports.client.joinWorkspace({
        source: discovery.source,
        prefix: candidate.prefix,
        expected: { ...candidate.identity },
        authentication,
      });
      await this.receiveWorkspaceResult(result, () => undefined, generation);
    });
  }

  resumeWorkspace(
    action: 'enroll' | 'retry',
    authentication: Authentication,
    onEnrolled: () => void,
    storageConfirmed = false
  ): Promise<void> {
    const workspace = this.state.status?.workspace;
    if (
      this.state.setupInvalidated ||
      !workspace ||
      (action === 'enroll' && (workspace.phase !== 'ready' || !storageConfirmed)) ||
      (action === 'retry' && (workspace.phase === 'allocating' || workspace.source.kind === 'join'))
    )
      return Promise.resolve();
    const generation = this.setupGeneration;
    return this.execute(async () => {
      if (!(await this.requestPermission(workspace.rootUrl)) || generation !== this.setupGeneration)
        return;
      const result =
        action === 'enroll'
          ? await this.ports.client.enrollWorkspace({
              source: workspace.source,
              authentication,
              storagePolicy: { version: 1, mode: 'on-demand' },
            })
          : await this.ports.client.retryWorkspace({ source: workspace.source, authentication });
      await this.receiveWorkspaceResult(result, onEnrolled, generation);
    });
  }

  setCheckpointInterval(intervalMs: SyncCheckpointInterval): Promise<void> {
    return this.execute(async () => {
      const result = await this.ports.client.setCheckpointInterval(intervalMs);
      if (result.kind !== 'checkpoint-policy') throw new Error('Checkpoint policy refused');
      if (this.active)
        this.publish({ checkpointInterval: result.intervalMs, message: 'checkpointSaved' });
    }, 'checkpointFailed');
  }

  flushCheckpoints(): Promise<void> {
    if (this.state.status?.connection?.phase !== 'active') return Promise.resolve();
    return this.execute(async () => {
      const result = await this.ports.client.flushCheckpoints();
      if (result.kind !== 'checkpoint-flushed') throw new Error('Checkpoint flush refused');
      if (this.active)
        this.publish({
          message:
            result.updated + result.alreadyDue > 0 ? 'checkpointQueued' : 'checkpointChecked',
        });
    }, 'checkpointFailed');
  }

  reloadStatus(): Promise<void> {
    return this.execute(() => this.readStatus(), 'checkpointFailed');
  }

  prepareLocalOnly(): Promise<void> {
    return this.execute(async () => {
      const { planRetainedLibrary, RetainedLibraryNotReadyError } =
        await import('../../../../workflows/sync-transfer/retained-library');
      let plan: RetainedLibraryPlan | null;
      try {
        plan = await planRetainedLibrary();
      } catch (error) {
        if (error instanceof RetainedLibraryNotReadyError) {
          this.publish({ message: 'localOnlySyncNotReady' });
          return;
        }
        throw error;
      }
      if (!this.active) return;
      if (!plan) {
        await this.readStatus();
        return;
      }
      this.publish({ localOnly: { plan, phase: 'confirm' } });
    }, 'localOnlyFailed');
  }

  confirmLocalOnly(): Promise<void> {
    const selected = this.state.localOnly;
    if (!selected || selected.phase !== 'confirm') return Promise.resolve();
    return this.execute(async () => {
      const abort = new AbortController();
      this.localOnlyAbort = abort;
      this.publish({ localOnly: { plan: selected.plan, phase: 'preparing' } });
      try {
        const { switchLibraryToLocalOnly, LocalOnlySwitchError } =
          await import('../../../../workflows/sync-transfer/local-only');
        try {
          const history = await switchLibraryToLocalOnly(selected.plan, abort.signal);
          if (this.active)
            this.publish({
              localOnly: null,
              message: history === 'incomplete' ? 'localOnlyReadyHistoryGap' : 'localOnlyReady',
            });
        } catch (error) {
          if (this.active)
            this.publish({
              localOnly: null,
              message:
                error instanceof Error && error.name === 'AbortError'
                  ? 'localOnlyCancelled'
                  : error instanceof LocalOnlySwitchError && error.code === 'pending-outgoing'
                    ? 'localOnlyPending'
                    : 'localOnlyFailed',
            });
        }
        if (this.active) await this.readStatus();
      } finally {
        if (this.localOnlyAbort === abort) this.localOnlyAbort = null;
      }
    }, 'localOnlyFailed');
  }

  cancelLocalOnly(): void {
    const selected = this.state.localOnly;
    if (!selected) return;
    if (selected.phase === 'confirm') this.publish({ localOnly: null });
    else {
      this.localOnlyAbort?.abort();
      this.publish({ localOnly: { ...selected, phase: 'cancelling' } });
    }
  }

  refresh(): Promise<void> {
    return this.execute(async () => {
      const result = await this.ports.client.refreshCatalog(true);
      if (!this.active) return;
      if (result.kind === 'accepted') this.startCatalogWait(result.requestId);
      else this.publish({ message: 'failed' });
      await this.readStatus();
    });
  }

  abandon(): Promise<void> {
    ++this.setupGeneration;
    this.setupEdited = true;
    this.publish({ discovery: null });
    return this.execute(
      async () => {
        const source = this.state.status?.workspace?.source;
        const requestId = this.workspaceRequestId;
        if ((!source && !requestId) || this.state.status?.connection) {
          this.publish({ message: 'abandonFailed' });
          return;
        }
        let result: SyncProductResult;
        if (source) result = await this.ports.client.abandonWorkspace(source);
        else if (requestId) result = await this.ports.client.cancel(requestId);
        else return;
        if (!this.active) return;
        if (result.kind !== 'cancelled' || result.outcome !== 'cancelled') {
          this.publish({ message: 'abandonFailed' });
          return;
        }
        const revision = ++this.statusRevision;
        const latest = await this.ports.client.readStatus();
        if (!this.active || revision !== this.statusRevision) return;
        if (latest.kind !== 'status') {
          this.publish({ message: 'abandonFailed' });
          return;
        }
        this.applyStatus(latest.status);
        if (latest.status.workspace || latest.status.connection) {
          this.publish({ message: 'abandonFailed' });
          return;
        }
        this.catalogWaiter?.abort();
        this.catalogWaiter = null;
        this.containmentFailed = false;
        this.publish({ catalogJob: null, discovery: null, setupInvalidated: false, message: null });
      },
      'abandonFailed',
      true
    );
  }

  private async execute(
    command: () => Promise<void>,
    failure: Message = 'failed',
    allowCatalog = false
  ): Promise<void> {
    if (!this.active || this.state.busy || (this.state.catalogJob && !allowCatalog)) return;
    ++this.statusRevision;
    const generation = this.setupGeneration;
    this.publish({ busy: true, message: null });
    try {
      // Call immediately: a command's permission request must remain on the user's click stack.
      await command();
    } catch {
      if (this.active && generation === this.setupGeneration) this.publish({ message: failure });
    } finally {
      if (this.active) this.publish({ busy: false });
    }
  }

  private async requestPermission(url: string): Promise<boolean> {
    const origin = selectedWorkspaceOrigin(url);
    if (!origin) {
      this.publish({ message: 'invalidUrl' });
      return false;
    }
    const granted = await this.ports.requestPermission(origin);
    if (!this.active) return false;
    if (!granted) this.publish({ message: 'permissionDenied' });
    return granted;
  }

  private async receiveWorkspaceResult(
    result: SyncProductResult,
    onEnrolled: () => void,
    generation: number
  ): Promise<void> {
    if (!this.active || generation !== this.setupGeneration) {
      if (result.kind === 'accepted') {
        this.workspaceRequestId = result.requestId;
        try {
          const cancelled = await this.ports.client.cancel(result.requestId);
          if (cancelled.kind !== 'cancelled' || cancelled.outcome === 'refused')
            throw new Error('Setup cancellation refused');
          if (this.active) await this.readStatus();
        } catch {
          this.containmentFailed = true;
          if (this.active) {
            await this.readStatus();
            this.publish({ message: 'abandonFailed' });
          }
        }
      }
      return;
    }
    if (result.kind === 'enrolled') {
      onEnrolled();
      const refresh = await this.ports.client.refreshCatalog();
      if (this.active && refresh.kind === 'accepted') this.startCatalogWait(refresh.requestId);
    } else if (result.kind === 'accepted') {
      this.workspaceRequestId = result.requestId;
      this.workspaceAccepted = true;
      this.updateFallback();
    } else this.publish({ message: 'failed' });
    if (this.active) await this.readStatus();
  }

  private async readStatus(): Promise<void> {
    const revision = ++this.statusRevision;
    try {
      const result = await this.ports.client.readStatus();
      if (!this.active || revision !== this.statusRevision || result.kind !== 'status') return;
      this.applyStatus(result.status);
      if (!result.status.connection) {
        this.publish({ checkpointInterval: null });
        return;
      }
      try {
        const policy = await this.ports.client.readCheckpointPolicy();
        if (!this.active || revision !== this.statusRevision) return;
        if (policy.kind !== 'checkpoint-policy') throw new Error('Checkpoint policy unavailable');
        this.publish({ checkpointInterval: policy.intervalMs });
      } catch {
        if (this.active && revision === this.statusRevision)
          this.publish({ checkpointInterval: null, message: 'checkpointFailed' });
      }
    } catch {
      if (this.active && revision === this.statusRevision) this.publish({ message: 'failed' });
    }
  }

  private applyStatus(status: SyncProductStatus): void {
    if (
      !status.workspace ||
      status.connection ||
      (status.workspaceJob && status.workspaceJob.state !== 'running')
    )
      this.workspaceAccepted = false;
    const job = status.workspaceJob;
    const discovery =
      !this.setupEdited &&
      job?.state === 'discovered' &&
      status.workspace &&
      sameSource(status.workspace.source, job.discovery.source)
        ? job.discovery
        : null;
    if (!this.containmentFailed && (!status.workspace || job?.state !== 'running'))
      this.workspaceRequestId = null;
    this.publish({
      status,
      discovery,
      setupInvalidated: status.workspace ? this.state.setupInvalidated : false,
    });
    this.updateFallback();
  }

  private updateFallback(): void {
    const status = this.state.status;
    const awaiting =
      this.workspaceAccepted ||
      Boolean(status?.workspace && status.workspaceJob?.state === 'running');
    if (this.active && awaiting) {
      if (this.fallback === undefined) this.fallback = setInterval(this.refreshStatus, 30_000);
    } else {
      clearInterval(this.fallback);
      this.fallback = undefined;
    }
  }

  private startCatalogWait(requestId: string): void {
    this.catalogWaiter?.abort();
    const waiter = new AbortController();
    this.catalogWaiter = waiter;
    this.publish({ catalogJob: requestId, message: 'refreshing' });
    void this.observeCatalog(requestId, waiter);
  }

  private async observeCatalog(requestId: string, waiter: AbortController): Promise<void> {
    try {
      const result = await this.ports.client.waitForOperation(requestId, waiter.signal);
      if (waiter.signal.aborted) return;
      this.publish({
        message:
          result.job?.state === 'ready' && result.completion?.kind === 'catalog'
            ? 'refreshed'
            : 'failed',
        catalogJob: null,
      });
    } catch {
      if (!waiter.signal.aborted) this.publish({ message: 'failed', catalogJob: null });
    } finally {
      if (this.catalogWaiter === waiter) this.catalogWaiter = null;
    }
  }

  private updateLocalPresence(): void {
    const workspace = this.state.status?.workspace;
    const source = workspace?.source;
    const sourceKey =
      this.active &&
      !this.state.status?.connection &&
      workspace?.phase === 'ready' &&
      !this.state.setupInvalidated &&
      source
        ? JSON.stringify([source.kind, source.identity.incarnation, source.identity.revision])
        : null;
    if (sourceKey === this.presenceSourceKey) return;
    this.presenceSourceKey = sourceKey;
    const revision = ++this.presenceRevision;
    this.state = { ...this.state, localPresence: 'loading' };
    if (sourceKey === null) return;
    const current = () =>
      this.active && revision === this.presenceRevision && sourceKey === this.presenceSourceKey;
    void Promise.resolve()
      .then(() => (current() ? this.readLocalPresence() : null))
      .then(
        (present) => {
          if (current() && present !== null)
            this.publish({ localPresence: present ? 'present' : 'empty' });
        },
        () => {
          if (current()) this.publish({ localPresence: 'unavailable' });
        }
      );
  }

  private publish(patch: Partial<SyncConnectionViewState>): void {
    this.state = { ...this.state, ...patch };
    this.updateLocalPresence();
    if (this.active) this.ports.onChange(this.state);
  }
}

/** Own Settings status ordering, command admission, and workspace/catalog observation. */
export function createSyncConnectionController(ports: Ports) {
  return new SyncConnectionController(ports);
}
