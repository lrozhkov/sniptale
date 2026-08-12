export type EmbeddedCameraGeometry = {
  center: { x: number; y: number };
  cropOffset: { x: number; y: number };
  shape: 'circle' | 'rectangle';
  sizeFraction: number;
};

export const DEFAULT_EMBEDDED_CAMERA_GEOMETRY: EmbeddedCameraGeometry = {
  center: { x: 0.86, y: 0.82 },
  cropOffset: { x: 0, y: 0 },
  shape: 'circle',
  sizeFraction: 0.22,
};

export function pickEmbeddedCameraGeometry(
  geometry: EmbeddedCameraGeometry
): EmbeddedCameraGeometry {
  return {
    center: { x: geometry.center.x, y: geometry.center.y },
    cropOffset: { x: geometry.cropOffset.x, y: geometry.cropOffset.y },
    shape: geometry.shape,
    sizeFraction: geometry.sizeFraction,
  };
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

export function constrainEmbeddedCameraGeometry(
  geometry: EmbeddedCameraGeometry,
  viewport: { width: number; height: number }
): EmbeddedCameraGeometry {
  const shortSide = Math.max(1, Math.min(viewport.width, viewport.height));
  const sizeFraction = clamp(geometry.sizeFraction, 0.12, 0.55);
  const width = sizeFraction * shortSide;
  const height = geometry.shape === 'circle' ? width : width * (9 / 16);
  const xMargin = width / Math.max(1, viewport.width) / 2;
  const yMargin = height / Math.max(1, viewport.height) / 2;
  return {
    shape: geometry.shape,
    center: {
      x: clamp(geometry.center.x, xMargin, 1 - xMargin),
      y: clamp(geometry.center.y, yMargin, 1 - yMargin),
    },
    cropOffset: {
      x: clamp(geometry.cropOffset.x, -1, 1),
      y: clamp(geometry.cropOffset.y, -1, 1),
    },
    sizeFraction,
  };
}

export function resizeEmbeddedCameraGeometry(
  origin: EmbeddedCameraGeometry,
  corner: 'nw' | 'ne' | 'se' | 'sw',
  delta: { x: number; y: number },
  viewport: { width: number; height: number }
): EmbeddedCameraGeometry {
  const horizontalDirection = corner.includes('w') ? -1 : 1;
  const verticalDirection = corner.includes('n') ? -1 : 1;
  const resizeDelta = Math.max(delta.x * horizontalDirection, delta.y * verticalDirection);
  return constrainEmbeddedCameraGeometry(
    {
      ...origin,
      sizeFraction: origin.sizeFraction + resizeDelta / Math.min(viewport.width, viewport.height),
    },
    viewport
  );
}
