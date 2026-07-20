import {
  VideoMediaShadowMode,
  type VideoMediaShadowMode as VideoMediaShadowModeValue,
} from '../../project/types';

interface VideoMediaShadowParams {
  blur: number;
  color: string;
  offsetX: number;
  offsetY: number;
  paint: { color: string; kind: 'fill' } | { color: string; kind: 'outer-shadow' };
}

export function normalizeVideoMediaShadowIntensity(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizeVideoMediaShadowMode(
  value: VideoMediaShadowModeValue | undefined
): VideoMediaShadowModeValue {
  return value === VideoMediaShadowMode.GLOW
    ? VideoMediaShadowMode.GLOW
    : VideoMediaShadowMode.BACKDROP;
}

export function resolveVideoMediaShadowParams(
  intensity: number | undefined,
  displayScale = 1,
  mode: VideoMediaShadowModeValue | undefined = VideoMediaShadowMode.BACKDROP
): VideoMediaShadowParams | null {
  const normalizedIntensity = normalizeVideoMediaShadowIntensity(intensity);
  if (normalizedIntensity <= 0) {
    return null;
  }

  const strength = normalizedIntensity / 100;
  const scale = Math.max(0.1, displayScale);
  const normalizedMode = normalizeVideoMediaShadowMode(mode);
  if (normalizedMode === VideoMediaShadowMode.GLOW) {
    return {
      blur: Math.round((12 + strength * 34) * scale * 100) / 100,
      color: `rgba(255, 255, 255, ${Math.min(0.52, 0.2 + strength * 0.28).toFixed(2)})`,
      offsetX: 0,
      offsetY: 0,
      paint: {
        color: 'rgba(255, 255, 255, 1)',
        kind: 'outer-shadow',
      },
    };
  }

  return {
    blur: Math.round((10 + strength * 28) * scale * 100) / 100,
    color: `rgba(0, 0, 0, ${Math.min(0.42, 0.16 + strength * 0.24).toFixed(2)})`,
    offsetX: 0,
    offsetY: 0,
    paint: { color: 'rgba(0, 0, 0, 1)', kind: 'outer-shadow' },
  };
}

export function resolveVideoMediaShadowCss(
  intensity: number | undefined,
  mode?: VideoMediaShadowModeValue
): string | undefined {
  const shadow = resolveVideoMediaShadowParams(intensity, 1, mode);
  if (!shadow) {
    return undefined;
  }

  return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`;
}
