import { isBoundedNumber, isRecord } from '../validation/primitives';

/** Clip-wide framing is independent of the camera's animated scene transform. */
export interface CameraAppearance {
  shape: 'rounded' | 'soft' | 'ellipse';
  roundness: number;
  zoom: number;
  panX: number;
  panY: number;
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
    (value['shape'] === 'rounded' || value['shape'] === 'soft' || value['shape'] === 'ellipse') &&
    isBoundedNumber(value['roundness'], 0, 100) &&
    isBoundedNumber(value['zoom'], 1, 4) &&
    isBoundedNumber(value['panX'], -1, 1) &&
    isBoundedNumber(value['panY'], -1, 1)
  );
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
  const exponent = appearance.shape === 'ellipse' ? 2 : 5 - appearance.roundness * 0.02;
  return Array.from({ length: 128 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 128;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return {
      x: (width / 2) * (1 + Math.sign(c) * Math.abs(c) ** (2 / exponent)),
      y: (height / 2) * (1 + Math.sign(s) * Math.abs(s) ** (2 / exponent)),
    };
  });
}
