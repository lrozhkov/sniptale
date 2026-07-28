import {
  createCropStream,
  type CropRect,
  type CropStreamGeometry,
  type OutputSize,
} from './crop-stream';

export type TabOutputGeometry = CropStreamGeometry & {
  coordinateSpace: TabOutputCoordinateSpace;
  requestedCrop: CropRect;
  sourceSize: OutputSize;
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
  coordinateSpace: TabOutputCoordinateSpace
): TabOutputGeometry {
  const source = requirePositiveSize(sourceSize, 'Tab source');
  const cssViewport = requireCoordinateSpace(coordinateSpace);
  const requested = requireRequestedCrop(requestedCrop, cssViewport);
  const outputSize = {
    width: requested.width,
    height: requested.height,
  };

  const density = cssViewport.devicePixelRatio;
  const expectedSourceWidth = cssViewport.width * density;
  const expectedSourceHeight = cssViewport.height * density;
  if (
    !Number.isInteger(expectedSourceWidth) ||
    !Number.isInteger(expectedSourceHeight) ||
    source.width !== expectedSourceWidth ||
    source.height !== expectedSourceHeight
  ) {
    throw new Error(
      'source-dimensions-mismatch: raw tab source does not exactly match the measured viewport density'
    );
  }

  const mappedBounds = [
    requested.x * density,
    requested.y * density,
    (requested.x + requested.width) * density,
    (requested.y + requested.height) * density,
  ];
  if (!mappedBounds.every(Number.isInteger)) {
    throw new Error(
      'source-dimensions-mismatch: crop bounds do not align to physical source pixels'
    );
  }
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
    outputSize,
    requestedCrop: { ...requested },
    sourceRect,
    sourceSize: { ...source },
  };
}

export function isSameTabOutputGeometry(
  left: TabOutputGeometry,
  right: TabOutputGeometry
): boolean {
  return (
    left.coordinateSpace.width === right.coordinateSpace.width &&
    left.coordinateSpace.height === right.coordinateSpace.height &&
    left.coordinateSpace.devicePixelRatio === right.coordinateSpace.devicePixelRatio &&
    left.requestedCrop.x === right.requestedCrop.x &&
    left.requestedCrop.y === right.requestedCrop.y &&
    left.requestedCrop.width === right.requestedCrop.width &&
    left.requestedCrop.height === right.requestedCrop.height &&
    left.sourceSize.width === right.sourceSize.width &&
    left.sourceSize.height === right.sourceSize.height &&
    left.sourceRect.x === right.sourceRect.x &&
    left.sourceRect.y === right.sourceRect.y &&
    left.sourceRect.width === right.sourceRect.width &&
    left.sourceRect.height === right.sourceRect.height &&
    left.outputSize.width === right.outputSize.width &&
    left.outputSize.height === right.outputSize.height
  );
}

export function revalidateTabOutputGeometry(
  geometry: TabOutputGeometry,
  sourceSize: OutputSize,
  coordinateSpace: TabOutputCoordinateSpace = geometry.coordinateSpace
): boolean {
  try {
    return isSameTabOutputGeometry(
      geometry,
      resolveTabOutputGeometry(geometry.requestedCrop, sourceSize, coordinateSpace)
    );
  } catch {
    return false;
  }
}

export function createTabOutputStream(
  sourceStream: MediaStream,
  geometry: TabOutputGeometry
): Promise<MediaStream> {
  return createCropStream(sourceStream, geometry);
}
