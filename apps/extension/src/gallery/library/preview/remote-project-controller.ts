import type { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import type {
  SyncProductResult,
  SyncRemoteSelection,
} from '../../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import type { loadGalleryLibrarySnapshot } from '../snapshot';
import type { openInEditor } from '../actions/preview';
import { isGalleryMediaItem } from '../items';
import { canOpenGalleryProject, type GalleryRemoteRootItem } from '../items/types';

/** Display state for preparation of one pinned remote selection. */
export type RemoteProjectPhase =
  | 'queued'
  | 'idle'
  | 'running'
  | 'failed'
  | 'cancelled'
  | 'cancel-refused'
  | 'selection-changed';

type OperationResult = Extract<SyncProductResult, { kind: 'operation' }>;
type ReplicaCompletion = Extract<NonNullable<OperationResult['completion']>, { kind: 'replica' }>;
interface Ports {
  client: Pick<
    ReturnType<typeof createSyncProductClient>,
    'prepareReplica' | 'resolveConflict' | 'cancel' | 'waitForOperation'
  >;
  loadSnapshot: typeof loadGalleryLibrarySnapshot;
  openEditor: typeof openInEditor;
  onPhase: (phase: RemoteProjectPhase) => void;
}

function sameSelection(left: SyncRemoteSelection, right: SyncRemoteSelection): boolean {
  return (
    left.rootKind === right.rootKind &&
    left.rootId === right.rootId &&
    left.operationId === right.operationId &&
    left.sourceDigest === right.sourceDigest
  );
}

class RemoteProjectController {
  private active = false;
  private generation = 0;
  private starting = false;
  private request: string | null = null;
  private cancelling = false;
  private cancelRequested = false;
  private waiter: AbortController | null = null;
  private resolution: { choice: string; id: string } | null = null;
  private operationKind: 'replica' | 'resolution' = 'replica';

  constructor(
    private readonly item: GalleryRemoteRootItem,
    private readonly ports: Ports
  ) {}

  activate(): void {
    this.active = true;
    ++this.generation;
  }

  dispose(): void {
    this.active = false;
    ++this.generation;
    this.waiter?.abort();
    this.waiter = null;
    const request = this.request;
    this.request = null;
    this.starting = false;
    this.cancelling = false;
    if (request) void this.ports.client.cancel(request).catch(() => undefined);
  }

  async start(): Promise<void> {
    if (!this.active || this.starting || this.request || !canOpenGalleryProject(this.item)) return;
    return this.startWork(
      () => this.ports.client.prepareReplica(this.item.remote.selection),
      'replica'
    );
  }

  async resolve(selection: SyncRemoteSelection): Promise<void> {
    if (
      !this.active ||
      this.starting ||
      this.request ||
      !this.item.remote.conflict ||
      this.item.remote.unavailable
    )
      return;
    const versions = this.item.remote.versions ?? [];
    if (
      versions.length < 2 ||
      !versions.some((version) => sameSelection(version.selection, selection))
    )
      return;
    const heads = versions.map((version) => version.selection.operationId).sort();
    const choice = JSON.stringify([selection, heads]);
    if (this.resolution?.choice !== choice) this.resolution = { choice, id: crypto.randomUUID() };
    const id = this.resolution.id;
    return this.startWork(
      () => this.ports.client.resolveConflict(selection, heads, id),
      'resolution'
    );
  }

  private async startWork(
    command: () => Promise<SyncProductResult>,
    kind: 'replica' | 'resolution'
  ): Promise<void> {
    const generation = this.generation;
    this.operationKind = kind;
    this.starting = true;
    this.cancelRequested = false;
    this.ports.onPhase('running');
    try {
      const result = await command();
      if (result.kind !== 'accepted') throw new Error('Replica request was not accepted.');
      if (!this.isActive(generation)) {
        void this.ports.client.cancel(result.requestId).catch(() => undefined);
        return;
      }
      this.request = result.requestId;
      if (this.cancelRequested) await this.cancel();
      else await this.observe(result.requestId, generation);
    } catch {
      if (this.isActive(generation)) this.ports.onPhase('failed');
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }

  async cancel(): Promise<void> {
    this.cancelRequested = true;
    const request = this.request;
    if (!request || this.cancelling || !this.active) return;
    const generation = this.generation;
    this.cancelling = true;
    this.waiter?.abort();
    try {
      const result = await this.ports.client.cancel(request);
      if (!this.isActive(generation)) return;
      if (result.kind === 'cancelled' && result.outcome === 'cancelled') {
        this.request = null;
        this.ports.onPhase('cancelled');
      } else {
        this.ports.onPhase(
          result.kind === 'cancelled' && result.outcome === 'already-completed'
            ? 'running'
            : 'cancel-refused'
        );
      }
    } catch {
      if (this.isActive(generation)) this.ports.onPhase('cancel-refused');
    } finally {
      if (this.isActive(generation)) {
        this.cancelling = false;
        // Refusal or a lost response cannot establish cancellation of the native operation.
        if (this.request === request) void this.observe(request, generation);
      }
    }
  }

  private isActive(generation: number): boolean {
    return this.active && this.generation === generation;
  }

  private canReceive(request: string, generation: number, waiter: AbortController): boolean {
    return (
      this.isActive(generation) &&
      !waiter.signal.aborted &&
      this.request === request &&
      !this.cancelling
    );
  }

  private async observe(request: string, generation: number): Promise<void> {
    this.waiter?.abort();
    const waiter = new AbortController();
    this.waiter = waiter;
    let terminal = false;
    try {
      const state = await this.ports.client.waitForOperation(request, waiter.signal);
      if (!this.canReceive(request, generation, waiter)) return;
      if (!state.job) throw new Error('Replica state unavailable.');
      if (state.job.state === 'failed' || state.job.state === 'interrupted') {
        this.request = null;
        this.ports.onPhase(
          state.job.failureCode === 'selection-changed' ? 'selection-changed' : 'failed'
        );
        return;
      }
      if (state.job.state !== 'ready') throw new Error('Replica result is not terminal.');
      terminal = true;
      if (this.operationKind === 'resolution') {
        if (
          state.completion?.kind !== 'resolution' ||
          state.completion.operationId !== this.resolution?.id
        )
          throw new Error('Conflict resolution completion unavailable.');
        this.request = null;
        this.ports.onPhase('queued');
        return;
      }
      if (state.completion?.kind !== 'replica') throw new Error('Replica completion unavailable.');
      await this.openCommitted(state.completion, request, generation, waiter);
    } catch {
      if (this.canReceive(request, generation, waiter)) {
        if (terminal) this.request = null;
        this.ports.onPhase(terminal ? 'failed' : 'cancel-refused');
      }
    } finally {
      if (this.waiter === waiter) this.waiter = null;
    }
  }

  private async openCommitted(
    completion: ReplicaCompletion,
    request: string,
    generation: number,
    waiter: AbortController
  ): Promise<void> {
    if (!sameSelection(completion.selection, this.item.remote.selection))
      throw new Error('Replica version mismatch.');
    const snapshot = await this.ports.loadSnapshot({ includeRemote: false });
    if (!this.canReceive(request, generation, waiter)) return;
    const native = snapshot.nextItems.find((candidate) => {
      if (candidate.entityId !== completion.selection.rootId) return false;
      if (completion.selection.rootKind === 'scenario-project')
        return candidate.type === 'scenario';
      if (completion.selection.rootKind === 'video-project')
        return candidate.type === 'video-project';
      if (completion.selection.rootKind === 'video-review')
        return candidate.type === 'quick-edit-project';
      return isGalleryMediaItem(candidate);
    });
    if (!native) throw new Error('Committed native project unavailable.');
    this.request = null;
    this.ports.onPhase('idle');
    this.ports.openEditor(native);
  }
}

/** Own admission, cancellation, observation, and navigation for one preview selection. */
export function createRemoteProjectController(item: GalleryRemoteRootItem, ports: Ports) {
  return new RemoteProjectController(item, ports);
}
