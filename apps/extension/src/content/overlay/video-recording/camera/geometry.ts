import {
  WEBCAM_DOCK_POSITIONS,
  type WebcamDockPosition,
  type WebcamPresentationSettings,
} from '@sniptale/runtime-contracts/video/types/types';

export type EmbeddedCameraGeometry = Omit<WebcamPresentationSettings, 'mode'>;

const EMBEDDED_CAMERA_INSET = 12;

/** Offers quarter positions only along the current long edges. Saved anchors remain stable. */
export function getEmbeddedCameraDockPositions(viewport: {
  width: number;
  height: number;
}): WebcamDockPosition[] {
  const basic = WEBCAM_DOCK_POSITIONS.filter((position) => position.length <= 2);
  const quarters: WebcamDockPosition[] =
    viewport.width >= viewport.height ? ['n25', 'n75', 's25', 's75'] : ['w25', 'w75', 'e25', 'e75'];
  return [...basic, ...quarters];
}

/** Resolves the legacy corner encoded by the saved camera center. */
export function getEmbeddedCameraCorner(geometry: EmbeddedCameraGeometry) {
  return geometry.center.y < 0.5
    ? geometry.center.x < 0.5
      ? 'nw'
      : 'ne'
    : geometry.center.x < 0.5
      ? 'sw'
      : 'se';
}

/** Reads the explicit anchor, with a compatible corner for older settings. */
export function getEmbeddedCameraDockPosition(geometry: EmbeddedCameraGeometry) {
  return geometry.dockPosition ?? getEmbeddedCameraCorner(geometry);
}

/** Selects the closest projected camera center in viewport pixels. */
export function findEmbeddedCameraDockPosition(
  geometry: EmbeddedCameraGeometry,
  viewport: { width: number; height: number }
): WebcamDockPosition {
  let nearest: WebcamDockPosition = getEmbeddedCameraDockPosition(geometry);
  let distance = Number.POSITIVE_INFINITY;
  for (const dockPosition of getEmbeddedCameraDockPositions(viewport)) {
    const candidate = getEmbeddedCameraDockMarker(geometry, dockPosition, viewport);
    const next = Math.hypot(
      (candidate.center.x - geometry.center.x) * viewport.width,
      (candidate.center.y - geometry.center.y) * viewport.height
    );
    if (next < distance) {
      distance = next;
      nearest = dockPosition;
    }
  }
  return nearest;
}

/** Places the resize handle toward the available interior viewport space. */
export function getEmbeddedCameraResizeCorner(geometry: EmbeddedCameraGeometry) {
  if (geometry.freePlacement) return 'se';
  const position = getEmbeddedCameraDockPosition(geometry);
  if (position === 'ne') return 'sw';
  if (position === 'sw') return 'ne';
  return position.startsWith('n') || position.startsWith('w') ? 'se' : 'nw';
}

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
    ...(geometry.freePlacement === undefined ? {} : { freePlacement: geometry.freePlacement }),
    ...(geometry.dockPosition === undefined ? {} : { dockPosition: geometry.dockPosition }),
    ...(geometry.appearance ? { appearance: { ...geometry.appearance } } : {}),
  };
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

function dockCenter(
  position: WebcamDockPosition,
  viewport: { width: number; height: number },
  size: { width: number; height: number }
) {
  const xMargin = Math.min(
    0.5,
    (size.width / 2 + EMBEDDED_CAMERA_INSET) / Math.max(1, viewport.width)
  );
  const yMargin = Math.min(
    0.5,
    (size.height / 2 + EMBEDDED_CAMERA_INSET) / Math.max(1, viewport.height)
  );
  const along = position.endsWith('25') ? 0.25 : position.endsWith('75') ? 0.75 : 0.5;
  return {
    x: position.includes('w')
      ? xMargin
      : position.includes('e')
        ? 1 - xMargin
        : clamp(along, xMargin, 1 - xMargin),
    y: position.includes('n')
      ? yMargin
      : position.includes('s')
        ? 1 - yMargin
        : clamp(along, yMargin, 1 - yMargin),
  };
}

/** Keeps navigation markers compact and separate even when the camera is large. */
export function getEmbeddedCameraDockMarker(
  geometry: EmbeddedCameraGeometry,
  position: WebcamDockPosition,
  viewport: { width: number; height: number }
) {
  const width = Math.min(
    64,
    clamp(geometry.sizeFraction, 0.12, 0.55) * Math.min(viewport.width, viewport.height)
  );
  const height = geometry.shape === 'circle' ? width : (width * 9) / 16;
  return { width, height, center: dockCenter(position, viewport, { width, height }) };
}

/** Constrains camera geometry. Only an active move preview disables dock projection. */
export function constrainEmbeddedCameraGeometry(
  geometry: EmbeddedCameraGeometry,
  viewport: { width: number; height: number },
  dock = true
): EmbeddedCameraGeometry {
  const shortSide = Math.max(1, Math.min(viewport.width, viewport.height));
  const sizeFraction = clamp(geometry.sizeFraction, 0.12, 0.55);
  const width = sizeFraction * shortSide;
  const height = geometry.shape === 'circle' ? width : width * (9 / 16);
  const xMargin = width / Math.max(1, viewport.width) / 2;
  const yMargin = height / Math.max(1, viewport.height) / 2;
  const anchored = dock && !geometry.freePlacement;
  return {
    ...pickEmbeddedCameraGeometry(geometry),
    ...(geometry.freePlacement === undefined ? {} : { freePlacement: geometry.freePlacement }),
    ...(geometry.dockPosition === undefined ? {} : { dockPosition: geometry.dockPosition }),
    shape: geometry.shape,
    center: anchored
      ? dockCenter(getEmbeddedCameraDockPosition(geometry), viewport, { width, height })
      : {
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
