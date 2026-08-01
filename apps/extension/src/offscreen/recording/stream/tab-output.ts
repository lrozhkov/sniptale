import {
  createGatedCropStream,
  type GatedCropStream,
  type CropRect,
  type CropStreamGeometry,
  type OutputSize,
} from './crop-stream';
import { resolveContainedFrame } from './contain-frame';

export type TabOutputGeometry = CropStreamGeometry & {
  coordinateSpace: TabOutputCoordinateSpace;
  fit: 'contain' | 'cover' | 'source';
  logicalContentRect: CropRect;
  requestedCrop: CropRect;
  sourceSize: OutputSize;
  tracksFullViewport: boolean;
};

type TabOutputCoordinateSpace = OutputSize & {
  devicePixelRatio: number;
};

function requirePositiveSize(size: OutputSize, label: string): OutputSize {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(`${label} must have positive finite dimensions`);
  }
  return size;
}

function requireCoordinateSpace(
  coordinateSpace: TabOutputCoordinateSpace
): TabOutputCoordinateSpace {
  const size = requirePositiveSize(coordinateSpace, 'Tab CSS viewport');
  if (!Number.isFinite(coordinateSpace.devicePixelRatio) || coordinateSpace.devicePixelRatio <= 0) {
    throw new Error('Tab CSS viewport devicePixelRatio must be positive and finite');
  }
  return { ...size, devicePixelRatio: coordinateSpace.devicePixelRatio };
}

function requireRequestedCrop(crop: CropRect, coordinateSpace: TabOutputCoordinateSpace): CropRect {
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
  return crop;
}

export function resolveTabOutputGeometry(
  requestedCrop: CropRect,
  sourceSize: OutputSize,
  coordinateSpace: TabOutputCoordinateSpace,
  options: { tracksFullViewport?: boolean } = {}
): TabOutputGeometry {
  const source = requirePositiveSize(sourceSize, 'Tab source');
  const cssViewport = requireCoordinateSpace(coordinateSpace);
  const requested = requireRequestedCrop(requestedCrop, cssViewport);
  const logicalContentRect = resolveContainedFrame(cssViewport, source);
  const scale = logicalContentRect.width / cssViewport.width;
  const mappedBounds = [
    Math.round(logicalContentRect.x + requested.x * scale),
    Math.round(logicalContentRect.y + requested.y * scale),
    Math.round(logicalContentRect.x + (requested.x + requested.width) * scale),
    Math.round(logicalContentRect.y + (requested.y + requested.height) * scale),
  ];
  const [left, top, right, bottom] = mappedBounds as [number, number, number, number];
  const sourceRect = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
  if (
    sourceRect.width <= 0 ||
    sourceRect.height <= 0 ||
    sourceRect.x < 0 ||
    sourceRect.y < 0 ||
    sourceRect.x + sourceRect.width > source.width ||
    sourceRect.y + sourceRect.height > source.height
  ) {
    throw new Error('Tab output mapping falls outside the raw source');
  }

  return {
    coordinateSpace: { ...cssViewport },
    fit: 'cover',
    logicalContentRect,
    outputSize: { width: sourceRect.width, height: sourceRect.height },
    requestedCrop: { ...requested },
    sourceRect,
    sourceSize: { ...source },
    tracksFullViewport: options.tracksFullViewport === true,
  };
}

export function remapTabOutputGeometry(
  geometry: TabOutputGeometry,
  sourceSize: OutputSize,
  coordinateSpace: TabOutputCoordinateSpace
): TabOutputGeometry {
  const requestedCrop = geometry.tracksFullViewport
    ? { x: 0, y: 0, width: coordinateSpace.width, height: coordinateSpace.height }
    : geometry.requestedCrop;
  const remapped = resolveTabOutputGeometry(requestedCrop, sourceSize, coordinateSpace, {
    tracksFullViewport: geometry.tracksFullViewport,
  });
  const viewportAspectChanged =
    geometry.coordinateSpace.width * coordinateSpace.height !==
    coordinateSpace.width * geometry.coordinateSpace.height;
  return {
    ...remapped,
    fit: geometry.tracksFullViewport && viewportAspectChanged ? 'contain' : geometry.fit,
    outputSize: geometry.outputSize,
  };
}

export function isSameTabOutputGeometry(
  left: TabOutputGeometry,
  right: TabOutputGeometry
): boolean {
  return (
    areSizesEqual(left.coordinateSpace, right.coordinateSpace) &&
    left.coordinateSpace.devicePixelRatio === right.coordinateSpace.devicePixelRatio &&
    left.fit === right.fit &&
    areRectsEqual(left.logicalContentRect, right.logicalContentRect) &&
    areRectsEqual(left.requestedCrop, right.requestedCrop) &&
    areSizesEqual(left.sourceSize, right.sourceSize) &&
    areRectsEqual(left.sourceRect, right.sourceRect) &&
    areSizesEqual(left.outputSize, right.outputSize) &&
    left.tracksFullViewport === right.tracksFullViewport
  );
}

function areSizesEqual(left: OutputSize, right: OutputSize): boolean {
  return left.width === right.width && left.height === right.height;
}

function areRectsEqual(left: CropRect, right: CropRect): boolean {
  return left.x === right.x && left.y === right.y && areSizesEqual(left, right);
}

export function revalidateTabOutputGeometry(
  geometry: TabOutputGeometry,
  sourceSize: OutputSize,
  coordinateSpace: TabOutputCoordinateSpace = geometry.coordinateSpace
): boolean {
  try {
    return isSameTabOutputGeometry(
      geometry,
      remapTabOutputGeometry(geometry, sourceSize, coordinateSpace)
    );
  } catch {
    return false;
  }
}

export function createTabOutputStream(
  sourceStream: MediaStream,
  geometry: TabOutputGeometry,
  options: { frameRate?: number; initiallySuspended?: boolean } = {}
): Promise<GatedCropStream> {
  return createGatedCropStream(sourceStream, geometry, options);
}
