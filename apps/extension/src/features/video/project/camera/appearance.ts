import { isBoundedNumber, isRecord } from '../validation/primitives';

/** Source framing is independent of the camera window and source clock. */
export interface CameraCrop {
  zoom: number;
  panX: number;
  panY: number;
}

/** Shape is clip-wide; a position can override source framing. */
export interface CameraAppearance extends CameraCrop {
  shape: 'rounded' | 'soft' | 'ellipse' | 'circle';
  roundness: number;
}

export const DEFAULT_CAMERA_APPEARANCE: CameraAppearance = {
  shape: 'rounded',
  roundness: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
};

export function isCameraAppearance(value: unknown): value is CameraAppearance {
  return (
    isRecord(value) &&
    (value['shape'] === 'rounded' ||
      value['shape'] === 'soft' ||
      value['shape'] === 'ellipse' ||
      value['shape'] === 'circle') &&
    isBoundedNumber(value['roundness'], 0, 100) &&
    isCameraCrop(value)
  );
}

/** Resolve the visible pixel window without changing its authored container. */
export function cameraWindowFrame(
  frame: { x: number; y: number; width: number; height: number },
  shape: CameraAppearance['shape']
) {
  if (shape !== 'circle') return frame;
  const diameter = Math.min(frame.width, frame.height);
  return {
    x: frame.x + (frame.width - diameter) / 2,
    y: frame.y + (frame.height - diameter) / 2,
    width: diameter,
    height: diameter,
  };
}

/** Pan follows object-position: -1 exposes the start, +1 the end of the source. */
export function cameraContentFrame(
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
  appearance: CameraAppearance,
  stretch = false
) {
  const scale =
    Math.max(width / Math.max(1, sourceWidth), height / Math.max(1, sourceHeight)) *
    appearance.zoom;
  const w = stretch ? width * appearance.zoom : sourceWidth * scale;
  const h = stretch ? height * appearance.zoom : sourceHeight * scale;
  return {
    x: ((width - w) * (appearance.panX + 1)) / 2,
    y: ((height - h) * (appearance.panY + 1)) / 2,
    width: w,
    height: h,
  };
}

/** Normalized superellipse gives curved sides without changing the camera's bounds. */
export function cameraSilhouette(width: number, height: number, appearance: CameraAppearance) {
  const frame = cameraWindowFrame({ x: 0, y: 0, width, height }, appearance.shape);
  const exponent =
    appearance.shape === 'ellipse' || appearance.shape === 'circle'
      ? 2
      : 5 - appearance.roundness * 0.02;
  return Array.from({ length: 128 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 128;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return {
      x: frame.x + (frame.width / 2) * (1 + Math.sign(c) * Math.abs(c) ** (2 / exponent)),
      y: frame.y + (frame.height / 2) * (1 + Math.sign(s) * Math.abs(s) ** (2 / exponent)),
    };
  });
}

/** Admit source framing independently of clip-wide shape. */
export function isCameraCrop(value: unknown): value is CameraCrop {
  return (
    isRecord(value) &&
    isBoundedNumber(value['zoom'], 1, 4) &&
    isBoundedNumber(value['panX'], -1, 1) &&
    isBoundedNumber(value['panY'], -1, 1)
  );
}

/** Mix crop values with the caller's evaluated transition weight. */
export function interpolateCameraCrop(
  from: CameraCrop,
  to: CameraCrop,
  weight: number
): CameraCrop {
  return {
    zoom: from.zoom + (to.zoom - from.zoom) * weight,
    panX: from.panX + (to.panX - from.panX) * weight,
    panY: from.panY + (to.panY - from.panY) * weight,
  };
}
