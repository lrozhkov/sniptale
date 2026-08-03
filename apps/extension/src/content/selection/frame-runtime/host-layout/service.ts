import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import {
  createDocumentPagePlacement,
  resolveDocumentPagePlacement,
  type DocumentPagePlacement,
} from '../../../platform/frame';
import {
  createAnchorRegistry,
  isFrameRecoveryMeasurementValid,
  isFrameRecoveryPlacementValid,
  type AnchorPresentation,
  type AnchorRect,
} from './anchor-registry';
import {
  createDocumentSignalRegistry,
  type HostLayoutInvalidationOptions,
} from './document-signals';
import { createIframeSignalRegistry } from './iframe-signals';
import {
  applyFrameHostLayoutResult,
  reconcileManualFramePlacement,
  reconcileFrameHostLayout,
  resolveFrameAnchorBinding,
} from './reconcile';
import { createHostLayoutMotionAuthority, createHostLayoutScheduler } from './scheduler';
import { areElementsPresentationRelated, measureAnchorVisibility } from './visibility';

const RECOVERY_GRACE_MS = 500;

type MutableValue<T> = { current: T };
type FrameSetter = (frames: FrameData[]) => void;
type RecoveryTimer = { generation: number; timer: ReturnType<typeof setTimeout> };

type AnchorRecoveryItem = {
  frameId: string;
  status: 'missing' | 'ambiguous';
};

type AcceptedFramePlacement = {
  pagePlacement: DocumentPagePlacement;
  rect: AnchorRect;
};

export type FrameHostLayoutSnapshot = {
  presentations: ReadonlyMap<string, AnchorPresentation>;
  recoveries: readonly AnchorRecoveryItem[];
  version: number;
};

type FrameHostLayoutRuntime = {
  frameStatesRef: MutableValue<Map<string, FrameState>>;
  framesRef: MutableValue<FrameData[]>;
  onAnchorUnavailable(frameId: string, presentation: Exclude<AnchorPresentation, 'visible'>): void;
  setFrames: FrameSetter;
};

export type { AnchorPresentation } from './anchor-registry';

export interface FrameHostLayoutService {
  clear(): void;
  dispose(): void;
  getLastGoodPagePlacement(frameId: string): DocumentPagePlacement | null;
  getNode(frameId: string): HTMLElement | null;
  getSnapshot(): FrameHostLayoutSnapshot;
  hasElement(element: HTMLElement): boolean;
  invalidate(options?: HostLayoutInvalidationOptions): void;
  link(
    frameId: string,
    node: HTMLElement,
    selector: string,
    initial?: { pagePlacement: DocumentPagePlacement; rect: AnchorRect },
    options?: { requireAcceptedInitial?: boolean }
  ): AcceptedFramePlacement | null;
  recordManualPlacement(
    frameId: string,
    node: HTMLElement,
    measurement?: { pagePlacement: DocumentPagePlacement; rect: AnchorRect }
  ): AcceptedFramePlacement | null;
  restoreFrames(frames: FrameData[]): void;
  retireHistoryBindings(reachableFrameIds?: readonly string[]): void;
  start(runtime: FrameHostLayoutRuntime): () => void;
  subscribe(listener: () => void): () => void;
  unlink(frameId: string): void;
}

function isDocumentInDepartingTree(ownerDocument: Document, departingDocument: Document) {
  let currentDocument = ownerDocument;
  let depth = 0;
  while (depth < 10) {
    if (currentDocument === departingDocument) return true;
    const frame = currentDocument.defaultView?.frameElement;
    if (!frame) return false;
    currentDocument = frame.ownerDocument;
    depth += 1;
  }
  return false;
}

function cloneAcceptedFramePlacement(measurement: AcceptedFramePlacement): AcceptedFramePlacement {
  return {
    pagePlacement: {
      ...measurement.pagePlacement,
      iframePath: [...measurement.pagePlacement.iframePath],
    },
    rect: { ...measurement.rect },
  };
}

class FrameHostLayoutServiceOwner implements FrameHostLayoutService {
  private readonly registry = createAnchorRegistry();
  private readonly listeners = new Set<() => void>();
  private readonly recoveryReady = new Map<string, number>();
  private readonly recoveryTimers = new Map<string, RecoveryTimer>();
  private readonly observedNodes = new Map<string, HTMLElement>();
  private runtime: FrameHostLayoutRuntime | null = null;
  private scheduler: ReturnType<typeof createHostLayoutScheduler> | null = null;
  private viewportScrollInvalidated = false;
  private readonly motionAuthority = createHostLayoutMotionAuthority({
    bindings: () => this.registry.entries(),
    getBinding: (frameId) => this.registry.get(frameId),
    isPresentationRelated: areElementsPresentationRelated,
    suspend: (claims) => {
      const newlyUnavailable: string[] = [];
      let changed = false;
      claims.forEach(({ binding: claim, frameId }) => {
        const binding = this.registry.get(frameId);
        if (
          !binding?.node ||
          binding.generation !== claim.generation ||
          binding.node !== claim.node
        ) {
          return;
        }
        const wasVisible = binding.presentation === 'visible';
        if (!this.registry.setPresentation(frameId, 'suspended')) return;
        changed = true;
        if (wasVisible) newlyUnavailable.push(frameId);
      });
      if (!changed) return;
      this.rebuildSnapshot();
      newlyUnavailable.forEach((frameId) =>
        this.runtime?.onAnchorUnavailable(frameId, 'suspended')
      );
    },
  });
  private documentSignals: ReturnType<typeof createDocumentSignalRegistry> | null = null;
  private iframeSignals: ReturnType<typeof createIframeSignalRegistry> | null = null;
  private snapshot: FrameHostLayoutSnapshot = {
    presentations: new Map(),
    recoveries: [],
    version: 0,
  };
  private snapshotSignature = '';

  clear = () => {
    this.observedNodes.forEach((node) => this.documentSignals?.unobserve(node));
    this.registry.retainAll();
    this.observedNodes.clear();
    this.motionAuthority.clear();
    this.viewportScrollInvalidated = false;
    this.clearRecovery();
    this.rebuildSnapshot();
  };

  dispose = () => {
    this.stop();
    this.registry.clear();
    this.rebuildSnapshot();
    this.listeners.clear();
  };

  getLastGoodPagePlacement = (frameId: string) => {
    const placement = this.registry.getLastGoodPagePlacement(frameId);
    if (placement && this.isPlacementCurrentlyResolvable(placement)) return placement;
    const topPlacement = this.registry.getLastGoodTopPagePlacement(frameId);
    return topPlacement && this.isPlacementCurrentlyResolvable(topPlacement) ? topPlacement : null;
  };

  getNode = (frameId: string) => this.registry.get(frameId)?.node ?? null;

  getSnapshot = () => this.snapshot;

  hasElement = (element: HTMLElement) => this.registry.hasElement(element);

  invalidate = (options?: HostLayoutInvalidationOptions) => {
    if (!this.scheduler) return;
    this.viewportScrollInvalidated ||= options?.viewportScroll === true;
    this.scheduler.invalidate(options?.motion ? { motion: true } : undefined);
  };

  link: FrameHostLayoutService['link'] = (frameId, node, selector, initial, options) => {
    const observed = this.observedNodes.get(frameId);
    if (observed && observed !== node) this.documentSignals?.unobserve(observed);
    const binding = this.registry.link(frameId, node, selector);
    this.motionAuthority.discardStale();
    const visibility = initial ? measureAnchorVisibility(node) : null;
    let accepted: AcceptedFramePlacement | null = null;
    if (initial && visibility?.presentation === 'visible' && visibility.rect) {
      const topPagePlacement = createDocumentPagePlacement(
        document,
        initial.rect.x,
        initial.rect.y
      );
      if (topPagePlacement) {
        const measurementAccepted = this.registry.acceptMeasurement(frameId, binding.generation, {
          anchorPresentation: 'visible',
          anchorRect: visibility.rect,
          frameRect: initial.rect,
          node,
          pagePlacement: initial.pagePlacement,
          presentation: 'visible',
          topPagePlacement,
        });
        if (measurementAccepted) accepted = cloneAcceptedFramePlacement(initial);
      } else {
        this.registry.recordUnavailable(frameId, binding.generation, node, 'suspended');
      }
    } else if (initial && visibility) {
      this.registry.recordUnavailable(
        frameId,
        binding.generation,
        node,
        visibility.presentation === 'offscreen' ? 'offscreen' : 'suspended',
        visibility.rect
      );
    }
    if (options?.requireAcceptedInitial && accepted === null) {
      if (observed) this.documentSignals?.unobserve(observed);
      this.observedNodes.delete(frameId);
      this.registry.delete(frameId);
      this.motionAuthority.delete(frameId);
      this.recoveryReady.delete(frameId);
      this.clearRecoveryTimer(frameId);
      this.rebuildSnapshot();
      return null;
    }
    this.recoveryReady.delete(frameId);
    this.clearRecoveryTimer(frameId);
    this.documentSignals?.observe(node);
    this.observedNodes.set(frameId, node);
    this.rebuildSnapshot();
    this.invalidate();
    return accepted;
  };

  restoreFrames = (frames: FrameData[]) => {
    const linkedIds = new Set(
      frames.filter((frame) => frame.linkedElementSelector).map((frame) => frame.id)
    );
    Array.from(this.registry.entries()).forEach(([frameId]) => {
      if (!linkedIds.has(frameId)) this.unlink(frameId);
    });
    frames.forEach((frame) => this.restoreFrameBinding(frame));
    this.motionAuthority.discardStale();
    this.syncObservedNodes();
    this.ensureRecoveryTimers();
    this.rebuildSnapshot();
    this.invalidate();
  };

  start = (runtime: FrameHostLayoutRuntime) => {
    this.stop();
    this.runtime = runtime;
    this.scheduler = this.createScheduler();
    this.installDocumentSignals();
    this.documentSignals?.registerDocument(document);
    this.iframeSignals?.registerDocument(document);
    this.restoreFrames(runtime.framesRef.current);
    this.syncObservedNodes();
    this.invalidate();
    return this.stop;
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  recordManualPlacement: FrameHostLayoutService['recordManualPlacement'] = (
    frameId,
    node,
    measurement
  ) => {
    const result = reconcileManualFramePlacement({
      frameId,
      node,
      registry: this.registry,
      ...(measurement ? { measurement } : {}),
    });
    if (result.kind === 'rejected') return null;
    if (result.kind === 'accepted') {
      this.rebuildSnapshot();
      return result.placement;
    }
    if (result.presentation === 'missing') {
      this.motionAuthority.discardStale();
      this.syncObservedNodes();
      this.ensureRecoveryTimers();
    }
    this.rebuildSnapshot();
    if (result.wasVisible) {
      this.runtime?.onAnchorUnavailable(frameId, result.presentation);
    }
    this.invalidate();
    return null;
  };

  unlink = (frameId: string) => {
    const node = this.observedNodes.get(frameId);
    if (node) this.documentSignals?.unobserve(node);
    this.observedNodes.delete(frameId);
    this.registry.retain(frameId);
    this.motionAuthority.delete(frameId);
    this.recoveryReady.delete(frameId);
    this.clearRecoveryTimer(frameId);
    this.rebuildSnapshot();
  };

  retireHistoryBindings = (reachableFrameIds?: readonly string[]) => {
    this.registry.retireHistoryBindings(reachableFrameIds);
  };

  private restoreFrameBinding(frame: FrameData) {
    const selector = frame.linkedElementSelector;
    if (!selector) return;
    const recoveryRect = {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    };
    const recoveryPlacement =
      frame.pagePlacement &&
      isFrameRecoveryMeasurementValid({
        pagePlacement: frame.pagePlacement,
        rect: recoveryRect,
      })
        ? frame.pagePlacement
        : undefined;
    const createdTopPlacement = recoveryPlacement
      ? createDocumentPagePlacement(document, frame.x, frame.y)
      : null;
    const recoveryTopPlacement =
      createdTopPlacement &&
      isFrameRecoveryMeasurementValid({
        pagePlacement: createdTopPlacement,
        rect: recoveryRect,
      })
        ? createdTopPlacement
        : undefined;
    this.registry.restoreIntent(frame.id, selector, recoveryPlacement, recoveryTopPlacement);
    resolveFrameAnchorBinding(this.registry, frame);
  }

  private isPlacementCurrentlyResolvable(placement: DocumentPagePlacement) {
    if (!isFrameRecoveryPlacementValid(placement)) return false;
    const point = resolveDocumentPagePlacement(placement);
    return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  private createScheduler() {
    return createHostLayoutScheduler({
      advanceMotion: () => {
        const newlyCapped = this.motionAuthority.advanceBudgets();
        if (newlyCapped.size > 0) {
          this.registry.resetReacquireSamples(newlyCapped);
          this.rebuildSnapshot();
        }
        return this.motionAuthority.hasUncappedClaims();
      },
      onMotionSettled: () => {
        this.motionAuthority.settleTransient();
        this.runReconcile();
      },
      onSamplingAbandoned: () => this.registry.resetReacquireSamples(),
      run: () => this.runReconcile(true),
    });
  }

  private installDocumentSignals() {
    let iframeSignals: ReturnType<typeof createIframeSignalRegistry>;
    this.documentSignals = createDocumentSignalRegistry({
      beginExplicitMotion: this.motionAuthority.beginExplicit,
      beginTransientMotion: this.motionAuthority.beginTransient,
      continueExplicitMotion: this.motionAuthority.continueExplicit,
      endExplicitMotion: this.motionAuthority.endExplicit,
      documentWillUnload: (doc) => this.handleDocumentWillUnload(doc),
      invalidate: (options) => this.invalidate(options),
      registerAddedNode: (node) => iframeSignals.registerNode(node),
      unregisterRemovedNode: (node) => iframeSignals.unregisterNode(node),
    });
    iframeSignals = createIframeSignalRegistry({
      invalidate: () => this.invalidate(),
      registerDocument: (doc) => this.documentSignals?.registerDocument(doc),
      unregisterDocument: (doc) => this.documentSignals?.unregisterDocument(doc),
    });
    this.iframeSignals = iframeSignals;
  }

  private runReconcile = (stageLinkedMeasurements = false) => {
    const projectOffscreenGeometry = this.viewportScrollInvalidated;
    this.viewportScrollInvalidated = false;
    const runtime = this.runtime;
    if (!runtime) {
      return this.registry.createStabilitySample(
        this.motionAuthority.getFullyCappedGenerations(),
        this.motionAuthority.getStabilityTokens()
      );
    }
    const previousPresentations = new Map(
      Array.from(this.registry.entries()).map(([frameId, binding]) => [
        frameId,
        binding.presentation,
      ])
    );
    const sourceFrames = runtime.framesRef.current;
    const result = reconcileFrameHostLayout({
      cappedFrameGenerations: this.motionAuthority.getFullyCappedGenerations(),
      frameStates: runtime.frameStatesRef.current,
      frames: sourceFrames,
      movingFrameGenerations: this.motionAuthority.getMovingGenerations(),
      projectOffscreenGeometry,
      registry: this.registry,
      stageLinkedMeasurements,
    });
    this.motionAuthority.discardStale();
    if (result.frames !== sourceFrames) {
      const currentFrames = runtime.framesRef.current;
      const frames = applyFrameHostLayoutResult(currentFrames, sourceFrames, result.frames);
      if (this.runtime === runtime && frames !== currentFrames) {
        runtime.framesRef.current = frames;
        runtime.setFrames(frames);
      }
    }
    this.syncObservedNodes();
    this.notifyUnavailableAnchors(previousPresentations);
    this.ensureRecoveryTimers();
    this.rebuildSnapshot();
    return this.registry.createStabilitySample(
      this.motionAuthority.getFullyCappedGenerations(),
      this.motionAuthority.getStabilityTokens()
    );
  };

  private notifyUnavailableAnchors(previous: ReadonlyMap<string, AnchorPresentation>) {
    for (const [frameId, binding] of this.registry.entries()) {
      const presentation = binding.presentation;
      if (previous.get(frameId) === 'visible' && presentation !== 'visible') {
        this.runtime?.onAnchorUnavailable(frameId, presentation);
      }
    }
  }

  private handleDocumentWillUnload(doc: Document) {
    const previousPresentations = new Map(
      Array.from(this.registry.entries()).map(([frameId, binding]) => [
        frameId,
        binding.presentation,
      ])
    );
    let changed = false;
    for (const [frameId, binding] of this.registry.entries()) {
      if (!binding.node || !isDocumentInDepartingTree(binding.node.ownerDocument, doc)) continue;
      this.registry.markUnresolved(frameId, binding.selector, 'missing');
      changed = true;
    }
    if (!changed) return;
    this.motionAuthority.discardStale();
    this.syncObservedNodes();
    this.notifyUnavailableAnchors(previousPresentations);
    this.ensureRecoveryTimers();
    this.rebuildSnapshot();
    this.invalidate();
  }

  private syncObservedNodes() {
    const currentIds = new Set<string>();
    for (const [frameId, binding] of this.registry.entries()) {
      if (!binding.node) continue;
      currentIds.add(frameId);
      const previous = this.observedNodes.get(frameId);
      if (previous === binding.node) continue;
      if (previous) this.documentSignals?.unobserve(previous);
      this.observedNodes.set(frameId, binding.node);
      this.documentSignals?.observe(binding.node);
    }
    Array.from(this.observedNodes.entries()).forEach(([frameId, node]) => {
      if (currentIds.has(frameId)) return;
      this.documentSignals?.unobserve(node);
      this.observedNodes.delete(frameId);
    });
  }

  private rebuildSnapshot() {
    const presentations = new Map<string, AnchorPresentation>();
    for (const [frameId, binding] of this.registry.entries()) {
      presentations.set(frameId, binding.presentation);
    }
    const recoveries = this.buildRecoveries();
    const signature = [
      ...Array.from(presentations.entries()).map(([id, value]) => `${id}:${value}`),
      ...recoveries.map((item) => `${item.frameId}:${item.status}:recovery`),
    ].join('|');
    if (signature === this.snapshotSignature) return;
    this.snapshotSignature = signature;
    this.snapshot = { presentations, recoveries, version: this.snapshot.version + 1 };
    this.listeners.forEach((listener) => listener());
  }

  private buildRecoveries(): AnchorRecoveryItem[] {
    const framesById = new Map(
      (this.runtime?.framesRef.current ?? []).map((frame) => [frame.id, frame])
    );
    return Array.from(this.recoveryReady.entries()).flatMap(([frameId, generation]) => {
      const frame = framesById.get(frameId);
      const binding = frame ? this.registry.get(frame.id) : undefined;
      const presentation = binding?.presentation;
      if (
        !frame ||
        binding?.generation !== generation ||
        frame.createdBy === 'auto-blur' ||
        (presentation !== 'missing' && presentation !== 'ambiguous')
      ) {
        return [];
      }
      return [{ frameId: frame.id, status: presentation }];
    });
  }

  private ensureRecoveryTimers() {
    const frames = this.runtime?.framesRef.current ?? [];
    const frameIds = new Set(frames.map((frame) => frame.id));
    Array.from(this.recoveryTimers.keys()).forEach((frameId) => {
      if (!frameIds.has(frameId)) this.clearRecoveryTimer(frameId);
    });
    Array.from(this.recoveryReady.keys()).forEach((frameId) => {
      if (!frameIds.has(frameId)) this.recoveryReady.delete(frameId);
    });
    frames.forEach((frame) => this.ensureFrameRecoveryTimer(frame));
  }

  private ensureFrameRecoveryTimer(frame: FrameData) {
    const binding = this.registry.get(frame.id);
    if (
      !binding ||
      frame.createdBy === 'auto-blur' ||
      (binding.presentation !== 'missing' && binding.presentation !== 'ambiguous')
    ) {
      this.clearRecoveryTimer(frame.id);
      this.recoveryReady.delete(frame.id);
      return;
    }
    const generation = binding.generation;
    if (this.recoveryReady.get(frame.id) === generation) return;
    this.recoveryReady.delete(frame.id);
    const currentTimer = this.recoveryTimers.get(frame.id);
    if (currentTimer?.generation === generation) return;
    this.clearRecoveryTimer(frame.id);
    const timer = setTimeout(() => {
      if (this.recoveryTimers.get(frame.id)?.generation !== generation) return;
      this.recoveryTimers.delete(frame.id);
      const current = this.registry.get(frame.id);
      if (
        current?.generation === generation &&
        (current.presentation === 'missing' || current.presentation === 'ambiguous')
      ) {
        this.recoveryReady.set(frame.id, generation);
        this.rebuildSnapshot();
      }
    }, RECOVERY_GRACE_MS);
    this.recoveryTimers.set(frame.id, { generation, timer });
  }

  private clearRecoveryTimer(frameId: string) {
    const entry = this.recoveryTimers.get(frameId);
    if (entry) clearTimeout(entry.timer);
    this.recoveryTimers.delete(frameId);
  }

  private clearRecovery() {
    this.recoveryTimers.forEach(({ timer }) => clearTimeout(timer));
    this.recoveryTimers.clear();
    this.recoveryReady.clear();
  }

  private stop = () => {
    this.scheduler?.clear();
    this.scheduler = null;
    this.iframeSignals?.dispose();
    this.iframeSignals = null;
    this.documentSignals?.dispose();
    this.documentSignals = null;
    this.observedNodes.clear();
    this.motionAuthority.clear();
    this.viewportScrollInvalidated = false;
    this.registry.resetReacquireSamples();
    this.clearRecovery();
    this.runtime = null;
  };
}

export function createFrameHostLayoutService(): FrameHostLayoutService {
  return new FrameHostLayoutServiceOwner();
}
