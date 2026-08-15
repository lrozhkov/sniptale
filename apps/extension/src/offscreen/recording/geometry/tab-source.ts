import {
  VideoResolutionPreset,
  type VideoFrameRate,
} from '@sniptale/runtime-contracts/video/types/types';
import { resolveContainedFrame } from './contain-frame';
import {
  createRecordingGeometryPlan,
  remapRecordingGeometryPlan,
  type RecordingGeometryPlan,
  type RecordingPixelSize,
  type RecordingSampleRect,
} from './plan';

type TabLogicalRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

type TabOutputCoordinateSpace = RecordingPixelSize &
  Readonly<{
    devicePixelRatio: number;
  }>;

const RECOVERABLE_TAB_CROP_RESIZE_WARNING =
  'Tab crop no longer fits the resized viewport; containing the available frame';

export type TabOutputGeometry = RecordingGeometryPlan &
  Readonly<{
    coordinateSpace: TabOutputCoordinateSpace;
    fillsOutput: boolean;
    logicalContentRect: RecordingSampleRect;
    requestedCrop: TabLogicalRect;
    resolution: VideoResolutionPreset;
    sourceSize: RecordingPixelSize;
    tracksFullViewport: boolean;
  }>;

type TabOutputGeometryRemapOutcome =
  | Readonly<{
      geometry: TabOutputGeometry;
      kind: 'mapped';
    }>
  | Readonly<{
      geometry: TabOutputGeometry;
      kind: 'recoverable-contain';
      warning: typeof RECOVERABLE_TAB_CROP_RESIZE_WARNING;
    }>;

type TabOutputGeometryOptions = {
  frameRateCap: VideoFrameRate;
  resolution: VideoResolutionPreset;
  tracksFullViewport?: boolean;
};

function requirePositiveSize(size: RecordingPixelSize, label: string): RecordingPixelSize {
  if (
    !Number.isFinite(size.width) ||
    !Number.isInteger(size.width) ||
    !Number.isFinite(size.height) ||
    !Number.isInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(`${label} must have positive integer dimensions`);
  }
  return Object.freeze({ height: size.height, width: size.width });
}

function requireCoordinateSpace(
  coordinateSpace: TabOutputCoordinateSpace
): TabOutputCoordinateSpace {
  const size = requirePositiveSize(coordinateSpace, 'Tab CSS viewport');
  if (!Number.isFinite(coordinateSpace.devicePixelRatio) || coordinateSpace.devicePixelRatio <= 0) {
    throw new Error('Tab CSS viewport devicePixelRatio must be positive and finite');
  }
  return Object.freeze({ ...size, devicePixelRatio: coordinateSpace.devicePixelRatio });
}

function requireRequestedCrop(
  crop: TabLogicalRect,
  coordinateSpace: TabOutputCoordinateSpace
): TabLogicalRect {
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (
    !values.every((value) => Number.isFinite(value) && Number.isInteger(value)) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0 ||
    crop.x + crop.width > coordinateSpace.width ||
    crop.y + crop.height > coordinateSpace.height
  ) {
    throw new Error('Tab crop must stay inside the CSS viewport');
  }
  return Object.freeze({ ...crop });
}

function mapLogicalCropToSource(
  requestedCrop: TabLogicalRect,
  sourceSize: RecordingPixelSize,
  coordinateSpace: TabOutputCoordinateSpace
): { logicalContentRect: RecordingSampleRect; sourceRect: RecordingSampleRect } {
  const contained = resolveContainedFrame(coordinateSpace, sourceSize);
  const scale = contained.width / coordinateSpace.width;
  const left = Math.round(contained.x + requestedCrop.x * scale);
  const top = Math.round(contained.y + requestedCrop.y * scale);
  const right = Math.round(contained.x + (requestedCrop.x + requestedCrop.width) * scale);
  const bottom = Math.round(contained.y + (requestedCrop.y + requestedCrop.height) * scale);
  const sourceRect = { x: left, y: top, width: right - left, height: bottom - top };
  if (
    sourceRect.width <= 0 ||
    sourceRect.height <= 0 ||
    sourceRect.x < 0 ||
    sourceRect.y < 0 ||
    sourceRect.x + sourceRect.width > sourceSize.width ||
    sourceRect.y + sourceRect.height > sourceSize.height
  ) {
    throw new Error('Tab output mapping falls outside the raw source');
  }
  return {
    logicalContentRect: Object.freeze({
      height: contained.height,
      width: contained.width,
      x: contained.x,
      y: contained.y,
    }),
    sourceRect: Object.freeze(sourceRect),
  };
}

function matchSourceRectToOutputAspect(
  sourceRect: RecordingSampleRect,
  outputSize: RecordingPixelSize,
  maximumEdgeCrop: number
): RecordingSampleRect {
  const sourceAspect = sourceRect.width / sourceRect.height;
  const outputAspect = outputSize.width / outputSize.height;
  if (sourceAspect === outputAspect) return sourceRect;
  if (sourceAspect > outputAspect) {
    const width = sourceRect.height * outputAspect;
    if (sourceRect.width - width > maximumEdgeCrop) return sourceRect;
    return Object.freeze({
      ...sourceRect,
      width,
      x: sourceRect.x + (sourceRect.width - width) / 2,
    });
  }
  const height = sourceRect.width / outputAspect;
  if (sourceRect.height - height > maximumEdgeCrop) return sourceRect;
  return Object.freeze({
    ...sourceRect,
    height,
    y: sourceRect.y + (sourceRect.height - height) / 2,
  });
}

function insetSourceRectForCanvasSampling(sourceRect: RecordingSampleRect): RecordingSampleRect {
  const edgeInset = 1;
  if (sourceRect.width <= edgeInset * 2) return sourceRect;
  const width = sourceRect.width - edgeInset * 2;
  const height = sourceRect.height * (width / sourceRect.width);
  return Object.freeze({
    ...sourceRect,
    height,
    width,
    x: sourceRect.x + edgeInset,
    y: sourceRect.y + (sourceRect.height - height) / 2,
  });
}

function normalizeFullSourcePlan(
  plan: RecordingGeometryPlan,
  resolution: VideoResolutionPreset,
  tracksFullViewport: boolean,
  devicePixelRatio: number
): RecordingGeometryPlan {
  if (!tracksFullViewport || resolution !== VideoResolutionPreset.SOURCE) return plan;
  const matchedSourceRect = matchSourceRectToOutputAspect(
    plan.sourceRect,
    plan.outputSize,
    Math.max(1, devicePixelRatio)
  );
  const sourceRect = sourceRectFillsOutput(
    { ...plan, sourceRect: matchedSourceRect },
    resolution,
    true
  )
    ? insetSourceRectForCanvasSampling(matchedSourceRect)
    : matchedSourceRect;
  return remapRecordingGeometryPlan(plan, sourceRect);
}

function sourceRectFillsOutput(
  plan: RecordingGeometryPlan,
  resolution: VideoResolutionPreset,
  tracksFullViewport: boolean
): boolean {
  if (!tracksFullViewport || resolution !== VideoResolutionPreset.SOURCE) return false;
  const sourceAspect = plan.sourceRect.width / plan.sourceRect.height;
  const outputAspect = plan.outputSize.width / plan.outputSize.height;
  const tolerance = Number.EPSILON * Math.max(sourceAspect, outputAspect) * 8;
  return Math.abs(sourceAspect - outputAspect) <= tolerance;
}

function isRequestedCropInsideCoordinateSpace(
  crop: TabLogicalRect,
  coordinateSpace: TabOutputCoordinateSpace
): boolean {
  return (
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= coordinateSpace.width &&
    crop.y + crop.height <= coordinateSpace.height
  );
}

function buildRemappedGeometry(params: {
  coordinateSpace: TabOutputCoordinateSpace;
  geometry: TabOutputGeometry;
  logicalContentRect: RecordingSampleRect;
  requestedCrop: TabLogicalRect;
  sourceRect: RecordingSampleRect;
  sourceSize: RecordingPixelSize;
}): TabOutputGeometry {
  const remapped = normalizeFullSourcePlan(
    remapRecordingGeometryPlan(params.geometry, params.sourceRect),
    params.geometry.resolution,
    params.geometry.tracksFullViewport,
    params.coordinateSpace.devicePixelRatio
  );
  return Object.freeze({
    ...remapped,
    coordinateSpace: params.coordinateSpace,
    fillsOutput: sourceRectFillsOutput(
      remapped,
      params.geometry.resolution,
      params.geometry.tracksFullViewport
    ),
    logicalContentRect: params.logicalContentRect,
    requestedCrop: params.requestedCrop,
    resolution: params.geometry.resolution,
    sourceSize: params.sourceSize,
    tracksFullViewport: params.geometry.tracksFullViewport,
  });
}

export function resolveTabOutputGeometry(
  requestedCrop: TabLogicalRect,
  sourceSize: RecordingPixelSize,
  coordinateSpace: TabOutputCoordinateSpace,
  options: TabOutputGeometryOptions
): TabOutputGeometry {
  const source = requirePositiveSize(sourceSize, 'Tab source');
  const cssViewport = requireCoordinateSpace(coordinateSpace);
  const requested = requireRequestedCrop(requestedCrop, cssViewport);
  const mapping = mapLogicalCropToSource(requested, source, cssViewport);
  const plan = normalizeFullSourcePlan(
    createRecordingGeometryPlan({
      frameRateCap: options.frameRateCap,
      outputBasis: { height: requested.height, width: requested.width },
      resolution: options.resolution,
      sourceRect: mapping.sourceRect,
    }),
    options.resolution,
    options.tracksFullViewport === true,
    cssViewport.devicePixelRatio
  );

  return Object.freeze({
    ...plan,
    coordinateSpace: cssViewport,
    fillsOutput: sourceRectFillsOutput(
      plan,
      options.resolution,
      options.tracksFullViewport === true
    ),
    logicalContentRect: mapping.logicalContentRect,
    requestedCrop: requested,
    resolution: options.resolution,
    sourceSize: source,
    tracksFullViewport: options.tracksFullViewport === true,
  });
}

export function remapTabOutputGeometry(
  geometry: TabOutputGeometry,
  sourceSize: RecordingPixelSize,
  coordinateSpace: TabOutputCoordinateSpace
): TabOutputGeometryRemapOutcome {
  const source = requirePositiveSize(sourceSize, 'Tab source');
  const cssViewport = requireCoordinateSpace(coordinateSpace);
  if (
    !geometry.tracksFullViewport &&
    !isRequestedCropInsideCoordinateSpace(geometry.requestedCrop, cssViewport)
  ) {
    const availableFrame = mapLogicalCropToSource(
      { x: 0, y: 0, width: cssViewport.width, height: cssViewport.height },
      source,
      cssViewport
    );
    return Object.freeze({
      geometry: buildRemappedGeometry({
        coordinateSpace: cssViewport,
        geometry,
        logicalContentRect: availableFrame.logicalContentRect,
        requestedCrop: geometry.requestedCrop,
        sourceRect: availableFrame.sourceRect,
        sourceSize: source,
      }),
      kind: 'recoverable-contain',
      warning: RECOVERABLE_TAB_CROP_RESIZE_WARNING,
    });
  }
  const requestedCrop = geometry.tracksFullViewport
    ? requireRequestedCrop(
        { x: 0, y: 0, width: cssViewport.width, height: cssViewport.height },
        cssViewport
      )
    : requireRequestedCrop(geometry.requestedCrop, cssViewport);
  const mapping = mapLogicalCropToSource(requestedCrop, source, cssViewport);
  return Object.freeze({
    geometry: buildRemappedGeometry({
      coordinateSpace: cssViewport,
      geometry,
      logicalContentRect: mapping.logicalContentRect,
      requestedCrop,
      sourceRect: mapping.sourceRect,
      sourceSize: source,
    }),
    kind: 'mapped',
  });
}

export function remapTabOutputGeometryFromObservedViewport(
  geometry: TabOutputGeometry,
  sourceSize: RecordingPixelSize,
  observedViewport: RecordingSampleRect,
  coordinateSpace: TabOutputCoordinateSpace
): TabOutputGeometry {
  if (!geometry.tracksFullViewport) {
    throw new Error('Observed viewport remapping is only valid for full viewport output');
  }
  const source = requirePositiveSize(sourceSize, 'Tab source');
  const cssViewport = requireCoordinateSpace(coordinateSpace);
  const values = [
    observedViewport.x,
    observedViewport.y,
    observedViewport.width,
    observedViewport.height,
  ];
  if (
    !values.every((value) => Number.isFinite(value) && Number.isInteger(value)) ||
    observedViewport.x < 0 ||
    observedViewport.y < 0 ||
    observedViewport.width <= 0 ||
    observedViewport.height <= 0 ||
    observedViewport.x + observedViewport.width > source.width ||
    observedViewport.y + observedViewport.height > source.height
  ) {
    throw new Error('Observed viewport frame falls outside the raw tab source');
  }
  const requestedCrop = requireRequestedCrop(
    { x: 0, y: 0, width: cssViewport.width, height: cssViewport.height },
    cssViewport
  );
  return buildRemappedGeometry({
    coordinateSpace: cssViewport,
    geometry,
    logicalContentRect: Object.freeze({ ...observedViewport }),
    requestedCrop,
    sourceRect: Object.freeze({ ...observedViewport }),
    sourceSize: source,
  });
}

function areSizesEqual(left: RecordingPixelSize, right: RecordingPixelSize): boolean {
  return left.width === right.width && left.height === right.height;
}

function areRectsEqual(left: TabLogicalRect, right: TabLogicalRect): boolean {
  return left.x === right.x && left.y === right.y && areSizesEqual(left, right);
}

export function isSameTabOutputGeometry(
  left: TabOutputGeometry,
  right: TabOutputGeometry
): boolean {
  return (
    areSizesEqual(left.coordinateSpace, right.coordinateSpace) &&
    left.coordinateSpace.devicePixelRatio === right.coordinateSpace.devicePixelRatio &&
    left.fit === right.fit &&
    left.frameRateCap === right.frameRateCap &&
    left.fillsOutput === right.fillsOutput &&
    areRectsEqual(left.logicalContentRect, right.logicalContentRect) &&
    areSizesEqual(left.outputBasis, right.outputBasis) &&
    areRectsEqual(left.requestedCrop, right.requestedCrop) &&
    left.resolution === right.resolution &&
    areSizesEqual(left.sourceSize, right.sourceSize) &&
    areRectsEqual(left.sourceRect, right.sourceRect) &&
    areSizesEqual(left.outputSize, right.outputSize) &&
    left.tracksFullViewport === right.tracksFullViewport
  );
}

export function revalidateTabOutputGeometry(
  geometry: TabOutputGeometry,
  sourceSize: RecordingPixelSize,
  coordinateSpace: TabOutputCoordinateSpace = geometry.coordinateSpace
): boolean {
  try {
    return isSameTabOutputGeometry(
      geometry,
      remapTabOutputGeometry(geometry, sourceSize, coordinateSpace).geometry
    );
  } catch {
    return false;
  }
}
