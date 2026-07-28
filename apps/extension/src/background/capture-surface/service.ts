import { browserWindows } from '@sniptale/platform/browser/windows';
import type { ViewportPresetAvailability } from '../../features/viewport-presets/contracts';
import type { CaptureSurfaceOwner } from '../storage/capture-surface/contracts';
import { getCaptureSurfaceAvailabilities, getCaptureSurfaceAvailability } from './availability';
import { CaptureSurfaceLeaseApplication } from './lease-application';
import { CaptureSurfaceLeaseDisposal } from './lease-disposal';
import { CaptureSurfaceLeaseReassertion } from './lease-reassertion';
import { CaptureSurfaceLeaseRegistry } from './lease-registry';
import { CaptureSurfaceLeaseRelease } from './lease-release';
import { recoverCaptureSurfaceLeases } from './recovery';
import type {
  AppliedCaptureSurface,
  CaptureSurfaceContext,
  CaptureSurfaceLeaseRequest,
  CaptureSurfaceReleaseRequest,
  CaptureSurfaceService,
} from './types';

export class DefaultCaptureSurfaceService implements CaptureSurfaceService {
  private readonly registry = new CaptureSurfaceLeaseRegistry();
  private readonly application = new CaptureSurfaceLeaseApplication(this.registry);
  private readonly disposal = new CaptureSurfaceLeaseDisposal(this.registry);
  private readonly reassertion = new CaptureSurfaceLeaseReassertion(this.registry);
  private readonly releaseOwner = new CaptureSurfaceLeaseRelease(this.registry);
  private mutationQueue = Promise.resolve<unknown>(undefined);
  private recovery: Promise<void> | null = null;

  constructor() {
    browserWindows.subscribeBoundsChanged((window) => {
      if (window.id === undefined) return;
      void this.enqueue(() => this.reassertion.detectWindowConflict(window.id!));
    });
  }

  apply(request: CaptureSurfaceLeaseRequest): Promise<AppliedCaptureSurface> {
    return this.afterRecovery(() => this.enqueue(() => this.application.apply(request)));
  }

  replace(request: CaptureSurfaceLeaseRequest): Promise<AppliedCaptureSurface> {
    return this.afterRecovery(() =>
      this.enqueue(() => this.application.apply(request, { replaceCurrent: true }))
    );
  }

  getApplied(tabId: number): AppliedCaptureSurface | null {
    return this.registry.getApplied(tabId);
  }

  getAppliedForSession(sessionId: string): AppliedCaptureSurface | null {
    return this.registry.getAppliedForSession(sessionId);
  }

  handleDebuggerDetach(tabId: number): Promise<readonly CaptureSurfaceOwner[]> {
    const ready = this.recovery ?? Promise.resolve();
    return ready.then(() => this.enqueue(() => this.disposal.handleDebuggerDetach(tabId)));
  }

  getAvailability(args: {
    tabId: number;
    presetId: string;
    context: CaptureSurfaceContext;
  }): Promise<ViewportPresetAvailability> {
    return this.afterRecovery(() => getCaptureSurfaceAvailability(args, this.registry.values()));
  }

  getAvailabilities(args: {
    tabId: number;
    presetIds: readonly string[];
    context: CaptureSurfaceContext;
  }): Promise<ViewportPresetAvailability[]> {
    return this.afterRecovery(() => getCaptureSurfaceAvailabilities(args, this.registry.values()));
  }

  recover(
    args: { liveSessionIds?: ReadonlySet<string> | Promise<ReadonlySet<string>> } = {}
  ): Promise<void> {
    const liveSessionIds = Promise.resolve(args.liveSessionIds ?? new Set<string>());
    this.recovery ??= liveSessionIds.then((live) =>
      this.enqueue(() => recoverCaptureSurfaceLeases(this.registry, live))
    );
    return this.recovery;
  }

  release(request: CaptureSurfaceReleaseRequest): Promise<void> {
    return this.afterRecovery(() => this.enqueue(() => this.releaseOwner.release(request)));
  }

  hasOwnerLease(owner: CaptureSurfaceOwner): boolean {
    return this.registry.hasOwnerLease(owner);
  }

  releaseOwners(owners: readonly CaptureSurfaceOwner[]): Promise<void> {
    return this.afterRecovery(() =>
      this.enqueue(() => this.releaseOwner.releaseOwners(new Set(owners)))
    );
  }

  releaseTabOwners(tabId: number, owners: readonly CaptureSurfaceOwner[]): Promise<void> {
    return this.afterRecovery(() =>
      this.enqueue(() => this.releaseOwner.releaseTabOwners(tabId, new Set(owners)))
    );
  }

  terminateClosedTab(tabId: number, owners: readonly CaptureSurfaceOwner[]): Promise<void> {
    return this.afterRecovery(() =>
      this.enqueue(() => this.disposal.terminateClosedTab(tabId, new Set(owners)))
    );
  }

  reassert(request: CaptureSurfaceReleaseRequest): Promise<void> {
    return this.afterRecovery(() => this.enqueue(() => this.reassertion.reassert(request)));
  }

  private async afterRecovery<T>(run: () => Promise<T>): Promise<T> {
    await this.recover();
    return run();
  }

  private enqueue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.catch(() => undefined).then(run);
    this.mutationQueue = next;
    return next;
  }
}
