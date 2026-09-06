import { resolveDocumentPagePlacement, type DocumentPagePlacement } from '../../../platform/frame';
import { createAnchorFingerprint, type AnchorFingerprint } from './anchor-identity';
import { isFinitePositiveRect, type AnchorRect } from './geometry';
import { HOST_LAYOUT_GEOMETRY_TOLERANCE_PX, type HostLayoutStabilitySample } from './scheduler';
import { isAnchorNodeCurrentDocument } from './visibility';

export type { AnchorRect } from './geometry';
type AnchorBindingStatus = 'bound' | 'reacquired' | 'missing' | 'ambiguous';
export type AnchorPresentation = 'visible' | 'offscreen' | 'suspended' | 'missing' | 'ambiguous';

export type AnchorBinding = {
  kind: 'active';
  bindingStatus: AnchorBindingStatus;
  fingerprint: AnchorFingerprint | null;
  frameId: string;
  generation: number;
  lastAcceptedNode: HTMLElement | null;
  lastGoodPagePlacement?: DocumentPagePlacement;
  lastGoodRect?: AnchorRect;
  lastGoodTopPagePlacement?: DocumentPagePlacement;
  node: HTMLElement | null;
  observedRect?: AnchorRect;
  presentation: AnchorPresentation;
  reacquireSample?: { previousRect?: AnchorRect; ready: boolean };
  selector: string;
};

type HistoryRetainedAnchor = Pick<
  AnchorBinding,
  | 'fingerprint'
  | 'frameId'
  | 'generation'
  | 'lastAcceptedNode'
  | 'lastGoodPagePlacement'
  | 'lastGoodRect'
  | 'lastGoodTopPagePlacement'
  | 'selector'
> & {
  kind: 'history-retained';
};

type AnchorRegistryEntry = AnchorBinding | HistoryRetainedAnchor;

type AcceptedMeasurement = {
  anchorPresentation: 'visible';
  anchorRect: AnchorRect;
  frameRect: AnchorRect;
  node: HTMLElement;
  pagePlacement: DocumentPagePlacement;
  presentation: 'visible' | 'suspended';
  stageOnly?: boolean;
  topPagePlacement: DocumentPagePlacement;
};

function clonePlacement(placement: DocumentPagePlacement): DocumentPagePlacement {
  return { ...placement, iframePath: [...placement.iframePath] };
}

function retainLastGoodPlacement(
  current: AnchorBinding | undefined,
  preservesIdentity: boolean
): Partial<
  Pick<AnchorBinding, 'lastGoodPagePlacement' | 'lastGoodRect' | 'lastGoodTopPagePlacement'>
> {
  if (!current || !preservesIdentity) return {};
  return {
    ...(current.lastGoodPagePlacement
      ? { lastGoodPagePlacement: clonePlacement(current.lastGoodPagePlacement) }
      : {}),
    ...(current.lastGoodRect ? { lastGoodRect: { ...current.lastGoodRect } } : {}),
    ...(current.lastGoodTopPagePlacement
      ? { lastGoodTopPagePlacement: clonePlacement(current.lastGoodTopPagePlacement) }
      : {}),
  };
}

export function isFrameRecoveryPlacementValid(placement: DocumentPagePlacement): boolean {
  return (
    Number.isFinite(placement.pageX) &&
    Number.isFinite(placement.pageY) &&
    Array.isArray(placement.iframePath) &&
    placement.iframePath.every((selector) => typeof selector === 'string')
  );
}

function isFiniteResolvablePlacement(placement: DocumentPagePlacement): boolean {
  if (!isFrameRecoveryPlacementValid(placement)) return false;
  const point = resolveDocumentPagePlacement(placement);
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function isFrameRecoveryMeasurementValid(measurement: {
  pagePlacement: DocumentPagePlacement;
  rect: AnchorRect;
}): boolean {
  return (
    isFinitePositiveRect(measurement.rect) &&
    isFrameRecoveryPlacementValid(measurement.pagePlacement)
  );
}

export function isFramePlacementMeasurementValid(measurement: {
  pagePlacement: DocumentPagePlacement;
  rect: AnchorRect;
}): boolean {
  return (
    isFrameRecoveryMeasurementValid(measurement) &&
    isFiniteResolvablePlacement(measurement.pagePlacement)
  );
}

function areRectsStable(left: AnchorRect, right: AnchorRect): boolean {
  return (
    Math.abs(left.x - right.x) <= HOST_LAYOUT_GEOMETRY_TOLERANCE_PX &&
    Math.abs(left.y - right.y) <= HOST_LAYOUT_GEOMETRY_TOLERANCE_PX &&
    Math.abs(left.width - right.width) <= HOST_LAYOUT_GEOMETRY_TOLERANCE_PX &&
    Math.abs(left.height - right.height) <= HOST_LAYOUT_GEOMETRY_TOLERANCE_PX
  );
}

export interface AnchorRegistry {
  acceptMeasurement(frameId: string, generation: number, measurement: AcceptedMeasurement): boolean;
  clear(): void;
  createStabilitySample(
    geometrySuppressedGenerations?: ReadonlyMap<string, number>,
    motionClaimTokens?: ReadonlyMap<string, string>
  ): HostLayoutStabilitySample;
  delete(frameId: string): void;
  entries(): IterableIterator<[string, AnchorBinding]>;
  get(frameId: string): AnchorBinding | undefined;
  getLastGoodPagePlacement(frameId: string): DocumentPagePlacement | null;
  getLastGoodTopPagePlacement(frameId: string): DocumentPagePlacement | null;
  hasElement(element: HTMLElement): boolean;
  link(frameId: string, node: HTMLElement, selector: string): AnchorBinding;
  markUnresolved(frameId: string, selector: string, status: 'missing' | 'ambiguous'): AnchorBinding;
  recordUnavailable(
    frameId: string,
    generation: number,
    node: HTMLElement,
    presentation: 'offscreen' | 'suspended',
    rect?: AnchorRect
  ): boolean;
  reacquire(frameId: string, node: HTMLElement, selector: string): AnchorBinding;
  resetReacquireSamples(generations?: ReadonlyMap<string, number>): void;
  retain(frameId: string): void;
  retainAll(): void;
  retireHistoryBindings(reachableFrameIds?: readonly string[]): void;
  restoreIntent(
    frameId: string,
    selector: string,
    recoveryPlacement?: DocumentPagePlacement,
    recoveryTopPlacement?: DocumentPagePlacement
  ): AnchorBinding;
  setPresentation(frameId: string, presentation: AnchorPresentation): boolean;
}

class AnchorRegistryOwner implements AnchorRegistry {
  private readonly bindings = new Map<string, AnchorRegistryEntry>();
  private nextGeneration = 1;

  acceptMeasurement(
    frameId: string,
    generation: number,
    measurement: AcceptedMeasurement
  ): boolean {
    const binding = this.get(frameId);
    if (
      !binding ||
      !binding.node ||
      binding.generation !== generation ||
      binding.node !== measurement.node
    ) {
      return false;
    }
    const valid =
      measurement.anchorPresentation === 'visible' &&
      isAnchorNodeCurrentDocument(measurement.node) &&
      isFinitePositiveRect(measurement.anchorRect) &&
      isFramePlacementMeasurementValid({
        pagePlacement: measurement.pagePlacement,
        rect: measurement.frameRect,
      }) &&
      isFiniteResolvablePlacement(measurement.topPagePlacement);
    if (!valid) {
      delete binding.observedRect;
      this.resetReacquireSample(binding);
      binding.presentation = 'suspended';
      return false;
    }

    binding.observedRect = { ...measurement.frameRect };
    if (binding.bindingStatus === 'reacquired') {
      const ready = this.advanceReacquireSample(binding, measurement.frameRect);
      if (measurement.stageOnly) {
        binding.presentation = 'suspended';
        return false;
      }
      if (!ready || measurement.presentation !== 'visible') {
        binding.presentation = 'suspended';
        return false;
      }
    } else if (measurement.stageOnly) {
      const geometryMatchesLastGood = Boolean(
        binding.lastGoodRect && areRectsStable(binding.lastGoodRect, measurement.frameRect)
      );
      binding.presentation =
        measurement.presentation === 'visible' && geometryMatchesLastGood ? 'visible' : 'suspended';
      return false;
    } else if (measurement.presentation !== 'visible') {
      binding.presentation = 'suspended';
      return false;
    }

    binding.bindingStatus = 'bound';
    binding.lastAcceptedNode = measurement.node;
    binding.lastGoodPagePlacement = clonePlacement(measurement.pagePlacement);
    binding.lastGoodRect = { ...measurement.frameRect };
    binding.lastGoodTopPagePlacement = clonePlacement(measurement.topPagePlacement);
    binding.presentation = 'visible';
    delete binding.reacquireSample;
    return true;
  }

  clear(): void {
    this.bindings.clear();
  }

  createStabilitySample(
    geometrySuppressedGenerations: ReadonlyMap<string, number> = new Map(),
    motionClaimTokens: ReadonlyMap<string, string> = new Map()
  ): HostLayoutStabilitySample {
    return Array.from(this.entries(), ([, binding]) => binding)
      .sort((left, right) => left.frameId.localeCompare(right.frameId))
      .map((binding) => {
        const rect =
          geometrySuppressedGenerations.get(binding.frameId) === binding.generation
            ? undefined
            : binding.observedRect;
        return {
          key: [
            binding.frameId,
            binding.generation,
            binding.bindingStatus,
            binding.presentation,
            motionClaimTokens.get(binding.frameId) ?? 'no-motion-claim',
            rect ? 'rect' : 'no-rect',
          ].join(':'),
          values: rect ? [rect.x, rect.y, rect.width, rect.height] : [],
        };
      });
  }

  delete(frameId: string): void {
    this.bindings.delete(frameId);
  }

  *entries(): IterableIterator<[string, AnchorBinding]> {
    for (const [frameId, binding] of this.bindings) {
      if (binding.kind === 'active') yield [frameId, binding];
    }
  }

  get(frameId: string): AnchorBinding | undefined {
    const binding = this.bindings.get(frameId);
    return binding?.kind === 'active' ? binding : undefined;
  }

  getLastGoodPagePlacement(frameId: string): DocumentPagePlacement | null {
    const placement = this.get(frameId)?.lastGoodPagePlacement;
    return placement ? clonePlacement(placement) : null;
  }

  getLastGoodTopPagePlacement(frameId: string): DocumentPagePlacement | null {
    const placement = this.get(frameId)?.lastGoodTopPagePlacement;
    return placement ? clonePlacement(placement) : null;
  }

  hasElement(element: HTMLElement): boolean {
    return Array.from(this.entries()).some(([, binding]) => binding.node === element);
  }

  link(frameId: string, node: HTMLElement, selector: string): AnchorBinding {
    const current = this.get(frameId);
    if (current?.node === node && current.selector === selector) {
      current.bindingStatus = 'bound';
      current.fingerprint = current.fingerprint ?? createAnchorFingerprint(node);
      current.lastAcceptedNode = node;
      delete current.reacquireSample;
      return current;
    }
    const preservesIdentity = current?.selector === selector;
    const next: AnchorBinding = {
      kind: 'active',
      bindingStatus: 'bound',
      fingerprint: createAnchorFingerprint(node),
      frameId,
      generation: this.takeGeneration(),
      lastAcceptedNode: node,
      ...retainLastGoodPlacement(current, preservesIdentity),
      node,
      presentation: 'suspended',
      selector,
    };
    this.bindings.set(frameId, next);
    return next;
  }

  markUnresolved(
    frameId: string,
    selector: string,
    status: 'missing' | 'ambiguous'
  ): AnchorBinding {
    const current = this.get(frameId);
    const preservesIdentity = current?.selector === selector;
    const next: AnchorBinding =
      current && preservesIdentity
        ? {
            ...current,
            bindingStatus: status,
            generation: current.node ? this.takeGeneration() : current.generation,
            node: null,
            presentation: status,
            selector,
          }
        : {
            kind: 'active',
            bindingStatus: status,
            fingerprint: null,
            frameId,
            generation: this.takeGeneration(),
            lastAcceptedNode: null,
            node: null,
            presentation: status,
            selector,
          };
    this.bindings.set(frameId, next);
    delete next.observedRect;
    delete next.reacquireSample;
    return next;
  }

  recordUnavailable(
    frameId: string,
    generation: number,
    node: HTMLElement,
    presentation: 'offscreen' | 'suspended',
    rect?: AnchorRect
  ): boolean {
    const binding = this.get(frameId);
    if (!binding || binding.generation !== generation || binding.node !== node) return false;
    binding.presentation = presentation;
    if (rect && isFinitePositiveRect(rect)) binding.observedRect = { ...rect };
    else delete binding.observedRect;
    this.resetReacquireSample(binding);
    return true;
  }

  reacquire(frameId: string, node: HTMLElement, selector: string): AnchorBinding {
    const current = this.get(frameId);
    if (
      current?.node === node &&
      current.selector === selector &&
      current.bindingStatus === 'reacquired'
    ) {
      return current;
    }
    const preservesIdentity = current?.selector === selector;
    const returnsToAcceptedNode = preservesIdentity && current.lastAcceptedNode === node;
    const next: AnchorBinding = {
      kind: 'active',
      bindingStatus: returnsToAcceptedNode ? 'bound' : 'reacquired',
      fingerprint:
        preservesIdentity && current.fingerprint
          ? current.fingerprint
          : createAnchorFingerprint(node),
      frameId,
      generation: this.takeGeneration(),
      lastAcceptedNode: preservesIdentity ? current.lastAcceptedNode : null,
      ...retainLastGoodPlacement(current, preservesIdentity),
      node,
      presentation: 'suspended',
      ...(!returnsToAcceptedNode ? { reacquireSample: { ready: false } } : {}),
      selector,
    };
    this.bindings.set(frameId, next);
    return next;
  }

  resetReacquireSamples(generations?: ReadonlyMap<string, number>): void {
    for (const [frameId, binding] of this.entries()) {
      if (binding.bindingStatus !== 'reacquired') continue;
      if (generations && generations.get(frameId) !== binding.generation) continue;
      this.resetReacquireSample(binding);
    }
  }

  retain(frameId: string): void {
    const current = this.get(frameId);
    if (!current) return;
    const retained: HistoryRetainedAnchor = {
      kind: 'history-retained',
      fingerprint: current.fingerprint,
      frameId,
      generation: this.takeGeneration(),
      lastAcceptedNode: current.lastAcceptedNode,
      ...retainLastGoodPlacement(current, true),
      selector: current.selector,
    };
    this.bindings.set(frameId, retained);
  }

  retainAll(): void {
    Array.from(this.entries()).forEach(([frameId]) => this.retain(frameId));
  }

  retireHistoryBindings(reachableFrameIds?: readonly string[]): void {
    const reachable = reachableFrameIds ? new Set(reachableFrameIds) : null;
    this.bindings.forEach((binding, frameId) => {
      if (binding.kind === 'history-retained' && (!reachable || !reachable.has(frameId))) {
        this.bindings.delete(frameId);
      }
    });
  }

  restoreIntent(
    frameId: string,
    selector: string,
    recoveryPlacement?: DocumentPagePlacement,
    recoveryTopPlacement?: DocumentPagePlacement
  ): AnchorBinding {
    const current = this.bindings.get(frameId);
    const preservesIdentity = current?.selector === selector;
    const node = preservesIdentity && current.kind === 'active' ? (current.node ?? null) : null;
    const validRecoveryPlacement =
      recoveryPlacement && isFrameRecoveryPlacementValid(recoveryPlacement)
        ? recoveryPlacement
        : undefined;
    const validRecoveryTopPlacement =
      recoveryTopPlacement && isFrameRecoveryPlacementValid(recoveryTopPlacement)
        ? recoveryTopPlacement
        : undefined;
    const next: AnchorBinding = {
      kind: 'active',
      bindingStatus: node ? 'bound' : 'missing',
      fingerprint: preservesIdentity ? (current.fingerprint ?? null) : null,
      frameId,
      generation: this.takeGeneration(),
      lastAcceptedNode: preservesIdentity ? (current.lastAcceptedNode ?? null) : null,
      ...(validRecoveryPlacement
        ? { lastGoodPagePlacement: clonePlacement(validRecoveryPlacement) }
        : preservesIdentity && current.lastGoodPagePlacement
          ? { lastGoodPagePlacement: clonePlacement(current.lastGoodPagePlacement) }
          : {}),
      ...(preservesIdentity && current.lastGoodRect
        ? { lastGoodRect: { ...current.lastGoodRect } }
        : {}),
      ...(validRecoveryTopPlacement
        ? { lastGoodTopPagePlacement: clonePlacement(validRecoveryTopPlacement) }
        : preservesIdentity && current.lastGoodTopPagePlacement
          ? { lastGoodTopPagePlacement: clonePlacement(current.lastGoodTopPagePlacement) }
          : {}),
      node,
      presentation: node ? 'suspended' : 'missing',
      selector,
    };
    this.bindings.set(frameId, next);
    return next;
  }

  setPresentation(frameId: string, presentation: AnchorPresentation): boolean {
    const binding = this.get(frameId);
    if (!binding || binding.presentation === presentation) return false;
    binding.presentation = presentation;
    if (presentation === 'missing' || presentation === 'ambiguous') {
      binding.bindingStatus = presentation;
    }
    return true;
  }

  private takeGeneration(): number {
    const generation = this.nextGeneration;
    this.nextGeneration += 1;
    return generation;
  }

  private advanceReacquireSample(binding: AnchorBinding, rect: AnchorRect): boolean {
    const previous = binding.reacquireSample?.previousRect;
    const ready = Boolean(previous && areRectsStable(previous, rect));
    binding.reacquireSample = { previousRect: { ...rect }, ready };
    return ready;
  }

  private resetReacquireSample(binding: AnchorBinding): void {
    if (binding.bindingStatus !== 'reacquired') return;
    binding.reacquireSample = { ready: false };
    delete binding.observedRect;
  }
}

export function createAnchorRegistry(): AnchorRegistry {
  return new AnchorRegistryOwner();
}
