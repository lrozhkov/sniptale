import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';
import {
  createDocumentPagePlacement,
  resolveDocumentPagePlacement,
  type DocumentPagePlacement,
} from '../../../platform/frame';
import { applyFrameOffsetToElement, calculateFrameViewportCoords } from '../manager/coords';
import {
  areAnchorFingerprintsEqual,
  createAnchorFingerprint,
  resolveAnchorCandidate,
} from './anchor-identity';
import {
  isFramePlacementMeasurementValid,
  type AnchorBinding,
  type AnchorRect,
  type AnchorRegistry,
} from './anchor-registry';
import { isAnchorNodeCurrentDocument, measureAnchorVisibility } from './visibility';

type FrameHostLayoutReconcileResult = {
  frames: FrameData[];
};

type ManualFramePlacement = {
  pagePlacement: DocumentPagePlacement;
  rect: AnchorRect;
};

type ManualFramePlacementResult =
  | { kind: 'accepted'; placement: ManualFramePlacement }
  | { kind: 'rejected' }
  | {
      kind: 'unavailable';
      presentation: 'missing' | 'offscreen' | 'suspended';
      wasVisible: boolean;
    };

type ManualFramePlacementArgs = {
  frameId: string;
  measurement?: ManualFramePlacement;
  node: HTMLElement;
  registry: AnchorRegistry;
};

type AvailableManualAnchor = {
  anchorRect: AnchorRect;
  binding: AnchorBinding;
  kind: 'available';
  wasVisible: boolean;
};

function recordManualAnchorUnavailable(input: {
  args: ManualFramePlacementArgs;
  binding: AnchorBinding;
  presentation: 'offscreen' | 'suspended';
  rect?: AnchorRect;
  wasVisible: boolean;
}): ManualFramePlacementResult {
  const recorded = input.args.registry.recordUnavailable(
    input.args.frameId,
    input.binding.generation,
    input.args.node,
    input.presentation,
    input.rect
  );
  return recorded
    ? { kind: 'unavailable', presentation: input.presentation, wasVisible: input.wasVisible }
    : { kind: 'rejected' };
}

function classifyManualAnchorAvailability(
  args: ManualFramePlacementArgs,
  binding: AnchorBinding
): AvailableManualAnchor | ManualFramePlacementResult {
  const wasVisible = binding.presentation === 'visible';
  if (!args.node.isConnected) {
    args.registry.markUnresolved(args.frameId, binding.selector, 'missing');
    return { kind: 'unavailable', presentation: 'missing', wasVisible };
  }
  const visibility = measureAnchorVisibility(args.node);
  if (visibility.presentation !== 'visible' || !visibility.rect) {
    const presentation = visibility.presentation === 'offscreen' ? 'offscreen' : 'suspended';
    return recordManualAnchorUnavailable({
      args,
      binding,
      presentation,
      wasVisible,
      ...(visibility.rect ? { rect: visibility.rect } : {}),
    });
  }

  return { anchorRect: visibility.rect, binding, kind: 'available', wasVisible };
}

function acceptVisibleManualFramePlacement(
  args: ManualFramePlacementArgs,
  available: AvailableManualAnchor
): ManualFramePlacementResult {
  if (!args.measurement || !isFramePlacementMeasurementValid(args.measurement)) {
    return { kind: 'rejected' };
  }

  const topPagePlacement = createDocumentPagePlacement(
    document,
    args.measurement.rect.x,
    args.measurement.rect.y
  );
  if (!topPagePlacement) {
    return recordManualAnchorUnavailable({
      args,
      binding: available.binding,
      presentation: 'suspended',
      rect: available.anchorRect,
      wasVisible: available.wasVisible,
    });
  }
  const accepted = args.registry.acceptMeasurement(args.frameId, available.binding.generation, {
    anchorPresentation: 'visible',
    anchorRect: available.anchorRect,
    frameRect: args.measurement.rect,
    node: args.node,
    pagePlacement: args.measurement.pagePlacement,
    presentation: 'visible',
    topPagePlacement,
  });
  if (!accepted) {
    const current = args.registry.get(args.frameId);
    return current?.node === args.node && current.presentation === 'suspended'
      ? {
          kind: 'unavailable',
          presentation: 'suspended',
          wasVisible: available.wasVisible,
        }
      : { kind: 'rejected' };
  }
  return {
    kind: 'accepted',
    placement: {
      pagePlacement: {
        ...args.measurement.pagePlacement,
        iframePath: [...args.measurement.pagePlacement.iframePath],
      },
      rect: { ...args.measurement.rect },
    },
  };
}

export function reconcileManualFramePlacement(
  args: ManualFramePlacementArgs
): ManualFramePlacementResult {
  const binding = args.registry.get(args.frameId);
  if (!binding || binding.node !== args.node) return { kind: 'rejected' };
  const availability = classifyManualAnchorAvailability(args, binding);
  return availability.kind === 'available'
    ? acceptVisibleManualFramePlacement(args, availability)
    : availability;
}

export function resolveFrameAnchorBinding(
  registry: AnchorRegistry,
  frame: FrameData
): AnchorBinding | undefined {
  const selector = frame.linkedElementSelector;
  if (!selector) return undefined;
  const current = registry.get(frame.id);
  const preservesIntent = current?.selector === selector;
  const acceptedNode = preservesIntent ? current?.lastAcceptedNode : null;
  if (
    acceptedNode?.isConnected &&
    current?.fingerprint &&
    isAnchorNodeCurrentDocument(acceptedNode) &&
    areAnchorFingerprintsEqual(createAnchorFingerprint(acceptedNode), current.fingerprint)
  ) {
    return current.node === acceptedNode
      ? current
      : registry.reacquire(frame.id, acceptedNode, selector);
  }
  const fingerprint = preservesIntent ? (current?.fingerprint ?? null) : null;
  if (!fingerprint) {
    return registry.markUnresolved(frame.id, selector, 'missing');
  }
  if (preservesIntent && current?.node?.isConnected && isAnchorNodeCurrentDocument(current.node)) {
    const currentFingerprint = createAnchorFingerprint(current.node);
    if (areAnchorFingerprintsEqual(currentFingerprint, fingerprint)) {
      if (current.bindingStatus !== 'reacquired') return current;
      const resolution = resolveAnchorCandidate(selector, fingerprint);
      if (resolution.kind === 'resolved' && resolution.element === current.node) return current;
      return registry.markUnresolved(
        frame.id,
        selector,
        resolution.kind === 'resolved' ? 'ambiguous' : resolution.kind
      );
    }
  }

  const resolution = resolveAnchorCandidate(selector, fingerprint);
  if (resolution.kind === 'resolved') {
    return registry.reacquire(frame.id, resolution.element, selector);
  }
  return registry.markUnresolved(frame.id, selector, resolution.kind);
}

function havePositionChanged(frame: FrameData, next: Pick<FrameData, 'x' | 'y'>) {
  return frame.x !== next.x || frame.y !== next.y;
}

function haveGeometryChanged(
  frame: FrameData,
  next: Pick<FrameData, 'x' | 'y' | 'width' | 'height'>
) {
  return (
    havePositionChanged(frame, next) || frame.width !== next.width || frame.height !== next.height
  );
}

function havePlacementChanged(
  current: FrameData['pagePlacement'],
  next: NonNullable<FrameData['pagePlacement']>
) {
  return (
    !current ||
    current.pageX !== next.pageX ||
    current.pageY !== next.pageY ||
    current.iframePath.join(' => ') !== next.iframePath.join(' => ')
  );
}

function reconcileFreeFrame(frame: FrameData, frameState: FrameState | undefined): FrameData {
  if (frameState === 'editing' || frameState === 'resizing') return frame;
  if (!frame.pagePlacement) return frame;
  const point = resolveDocumentPagePlacement(frame.pagePlacement);
  if (!point || !havePositionChanged(frame, point)) return frame;
  return { ...frame, x: point.x, y: point.y };
}

function arePlacementsEqual(left: FrameData['pagePlacement'], right: FrameData['pagePlacement']) {
  if (!left || !right) return left === right;
  return (
    left.pageX === right.pageX &&
    left.pageY === right.pageY &&
    left.iframePath.join(' => ') === right.iframePath.join(' => ')
  );
}

function areOffsetsEqual(left: FrameData['offset'], right: FrameData['offset']) {
  if (!left || !right) return left === right;
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function haveSameBorderMetrics(left: FrameData, right: FrameData) {
  const leftPadding = left.borderSettings?.padding;
  const rightPadding = right.borderSettings?.padding;
  return (
    left.borderSettings?.width === right.borderSettings?.width &&
    leftPadding?.top === rightPadding?.top &&
    leftPadding?.right === rightPadding?.right &&
    leftPadding?.bottom === rightPadding?.bottom &&
    leftPadding?.left === rightPadding?.left
  );
}

function hasSameGeometryAuthority(current: FrameData, source: FrameData) {
  return (
    current.x === source.x &&
    current.y === source.y &&
    current.width === source.width &&
    current.height === source.height &&
    current.linkedElementSelector === source.linkedElementSelector &&
    areOffsetsEqual(current.offset, source.offset) &&
    arePlacementsEqual(current.pagePlacement, source.pagePlacement) &&
    haveSameBorderMetrics(current, source)
  );
}

export function applyFrameHostLayoutResult(
  currentFrames: FrameData[],
  sourceFrames: FrameData[],
  resultFrames: FrameData[]
): FrameData[] {
  const sources = new Map(sourceFrames.map((frame) => [frame.id, frame]));
  const results = new Map(resultFrames.map((frame) => [frame.id, frame]));
  let changed = false;
  const frames = currentFrames.map((current) => {
    const source = sources.get(current.id);
    const result = results.get(current.id);
    if (!source || !result || result === source || !hasSameGeometryAuthority(current, source)) {
      return current;
    }
    const placement = result.pagePlacement;
    const next = {
      ...current,
      x: result.x,
      y: result.y,
      width: result.width,
      height: result.height,
      ...(placement
        ? { pagePlacement: { ...placement, iframePath: [...placement.iframePath] } }
        : {}),
    };
    if (
      next.x === current.x &&
      next.y === current.y &&
      next.width === current.width &&
      next.height === current.height &&
      arePlacementsEqual(next.pagePlacement, current.pagePlacement)
    ) {
      return current;
    }
    changed = true;
    return next;
  });
  return changed ? frames : currentFrames;
}

type LinkedReconcileArgs = {
  cappedFrameGenerations: ReadonlyMap<string, number>;
  frame: FrameData;
  frameState: FrameState | undefined;
  movingFrameGenerations: ReadonlyMap<string, number>;
  registry: AnchorRegistry;
  stageMeasurement: boolean;
};

function commitLinkedGeometry(
  args: LinkedReconcileArgs,
  binding: AnchorBinding,
  anchorRect: AnchorRect,
  presentation: 'visible' | 'suspended'
): FrameData {
  const node = binding.node!;
  const measured = args.frame.offset
    ? applyFrameOffsetToElement(node, args.frame.offset)
    : calculateFrameViewportCoords(node, args.frame.borderSettings);
  const nextRect = measured;
  const placement = createDocumentPagePlacement(node.ownerDocument, nextRect.x, nextRect.y);
  const topPagePlacement = createDocumentPagePlacement(document, nextRect.x, nextRect.y);
  if (!placement || !topPagePlacement) {
    args.registry.recordUnavailable(
      args.frame.id,
      binding.generation,
      node,
      'suspended',
      anchorRect
    );
    return args.frame;
  }
  const accepted = args.registry.acceptMeasurement(args.frame.id, binding.generation, {
    anchorPresentation: 'visible',
    anchorRect,
    frameRect: nextRect,
    node,
    pagePlacement: placement,
    presentation,
    stageOnly: args.stageMeasurement,
    topPagePlacement,
  });
  if (!accepted) {
    return args.frame;
  }

  if (
    !haveGeometryChanged(args.frame, nextRect) &&
    !havePlacementChanged(args.frame.pagePlacement, placement)
  ) {
    return args.frame;
  }
  return {
    ...args.frame,
    ...nextRect,
    pagePlacement: placement,
  };
}

function reconcileLinkedFrame(args: LinkedReconcileArgs): FrameData {
  const binding = resolveFrameAnchorBinding(args.registry, args.frame);
  if (!binding?.node) return args.frame;
  if (args.cappedFrameGenerations.get(args.frame.id) === binding.generation) {
    args.registry.setPresentation(args.frame.id, 'suspended');
    return args.frame;
  }

  const visibility = measureAnchorVisibility(binding.node);
  const moving = args.movingFrameGenerations.get(args.frame.id) === binding.generation;
  if (visibility.presentation !== 'visible' || !visibility.rect) {
    args.registry.recordUnavailable(
      args.frame.id,
      binding.generation,
      binding.node,
      moving || visibility.presentation === 'suspended' ? 'suspended' : 'offscreen',
      visibility.rect
    );
    return args.frame;
  }

  if (args.frameState === 'editing' || args.frameState === 'resizing') {
    if (moving || binding.bindingStatus === 'reacquired') {
      args.registry.recordUnavailable(
        args.frame.id,
        binding.generation,
        binding.node,
        'suspended',
        visibility.rect
      );
    } else {
      args.registry.setPresentation(args.frame.id, 'visible');
    }
    return args.frame;
  }

  return commitLinkedGeometry(args, binding, visibility.rect, moving ? 'suspended' : 'visible');
}

export function reconcileFrameHostLayout(args: {
  cappedFrameGenerations?: ReadonlyMap<string, number>;
  frameStates: ReadonlyMap<string, FrameState>;
  frames: FrameData[];
  movingFrameGenerations: ReadonlyMap<string, number>;
  registry: AnchorRegistry;
  stageLinkedMeasurements?: boolean;
}): FrameHostLayoutReconcileResult {
  let changed = false;
  const frames = args.frames.map((frame) => {
    const next = frame.linkedElementSelector
      ? reconcileLinkedFrame({
          frame,
          cappedFrameGenerations: args.cappedFrameGenerations ?? new Map(),
          frameState: args.frameStates.get(frame.id),
          movingFrameGenerations: args.movingFrameGenerations,
          registry: args.registry,
          stageMeasurement: args.stageLinkedMeasurements === true,
        })
      : reconcileFreeFrame(frame, args.frameStates.get(frame.id));
    changed ||= next !== frame;
    return next;
  });
  return { frames: changed ? frames : args.frames };
}
