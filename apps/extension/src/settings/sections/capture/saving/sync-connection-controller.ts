import type { createSyncProductClient } from '../../../../platform/runtime-messaging/sync-product-client';
import type {
  SyncProductResult,
  SyncProductStatus,
} from '../../../../contracts/messaging/contracts/runtime-message/sync-connection.types';

type Authentication = { kind: 'basic'; username: string; password: string };
type Message =
  | 'failed'
  | 'refreshing'
  | 'refreshed'
  | 'invalidUrl'
  | 'permissionDenied'
  | 'abandonFailed';

/** Safe display state; transient authentication is never retained by the controller. */
export interface SyncConnectionViewState {
  status: SyncProductStatus | null;
  busy: boolean;
  message: Message | null;
  catalogJob: string | null;
}

interface Ports {
  client: ReturnType<typeof createSyncProductClient>;
  requestPermission: (origin: string) => Promise<boolean>;
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

class SyncConnectionController {
  private state: SyncConnectionViewState = {
    status: null,
    busy: false,
    message: null,
    catalogJob: null,
  };
  private active = false;
  private statusRevision = 0;
  private workspaceAccepted = false;
  private fallback: ReturnType<typeof setInterval> | undefined;
  private catalogWaiter: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly refreshStatus = () => {
    void this.readStatus();
  };
  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') this.refreshStatus();
  };

  constructor(private readonly ports: Ports) {}

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
    ++this.statusRevision;
    this.unsubscribe?.();
    this.unsubscribe = null;
    window.removeEventListener('focus', this.refreshStatus);
    document.removeEventListener('visibilitychange', this.onVisible);
    clearInterval(this.fallback);
    this.fallback = undefined;
    this.catalogWaiter?.abort();
    this.catalogWaiter = null;
  }

  connect(input: ConnectionInput, onEnrolled: () => void): Promise<void> {
    return this.execute(async () => {
      const url = input.url.trim();
      if (!(await this.requestPermission(url))) return;
      const authentication: Authentication = {
        kind: 'basic',
        username: input.username,
        password: input.password,
      };
      const result =
        input.mode === 'create'
          ? await this.ports.client.createWorkspace({
              parentUrl: url,
              accountId: input.account.trim(),
              authentication,
            })
          : await this.ports.client.joinWorkspace({
              rootUrl: url,
              accountId: input.account.trim(),
              authentication,
            });
      await this.receiveWorkspaceResult(result, onEnrolled);
    });
  }

  resumeWorkspace(
    action: 'enroll' | 'retry',
    authentication: Authentication,
    onEnrolled: () => void
  ): Promise<void> {
    if (action === 'retry' && this.state.status?.workspace?.phase === 'allocating')
      return Promise.resolve();
    return this.execute(async () => {
      const workspace = this.state.status?.workspace;
      if (!workspace || !(await this.requestPermission(workspace.rootUrl))) return;
      const result =
        action === 'enroll'
          ? await this.ports.client.enrollWorkspace({ source: workspace.source, authentication })
          : await this.ports.client.retryWorkspace({ source: workspace.source, authentication });
      await this.receiveWorkspaceResult(result, onEnrolled);
    });
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
    return this.execute(
      async () => {
        const source = this.state.status?.workspace?.source;
        if (!source || this.state.status?.connection) {
          this.publish({ message: 'abandonFailed' });
          return;
        }
        const result = await this.ports.client.abandonWorkspace(source);
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
        this.publish({ catalogJob: null, message: null });
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
    this.publish({ busy: true, message: null });
    try {
      // Call immediately: a command's permission request must remain on the user's click stack.
      await command();
    } catch {
      if (this.active) this.publish({ message: failure });
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
    onEnrolled: () => void
  ): Promise<void> {
    if (!this.active) return;
    if (result.kind === 'enrolled') {
      onEnrolled();
      const refresh = await this.ports.client.refreshCatalog();
      if (this.active && refresh.kind === 'accepted') this.startCatalogWait(refresh.requestId);
    } else if (result.kind === 'accepted') {
      this.workspaceAccepted = true;
      this.updateFallback();
    } else this.publish({ message: 'failed' });
    if (this.active) await this.readStatus();
  }

  private async readStatus(): Promise<void> {
    const revision = ++this.statusRevision;
    try {
      const result = await this.ports.client.readStatus();
      if (this.active && revision === this.statusRevision && result.kind === 'status')
        this.applyStatus(result.status);
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
    this.publish({ status });
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

  private publish(patch: Partial<SyncConnectionViewState>): void {
    this.state = { ...this.state, ...patch };
    if (this.active) this.ports.onChange(this.state);
  }
}

/** Own Settings status ordering, command admission, and workspace/catalog observation. */
export function createSyncConnectionController(ports: Ports) {
  return new SyncConnectionController(ports);
}
