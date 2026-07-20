import type { VideoSceneGradientColorStop } from '../types/index';
import {
  addGradientStop,
  clampGradientOffset,
  clampGradientOpacity,
  createGradientColorStopColor,
  createGradientFallbackStops,
  normalizeGradientStops,
  removeGradientStop,
  reverseGradientStops,
} from '@sniptale/foundation/gradient-stops';

function createVideoSceneGradientFallbackStops(
  from: string,
  to: string
): VideoSceneGradientColorStop[] {
  return createGradientFallbackStops(from, to);
}

export function normalizeVideoSceneGradientStops(
  stops: readonly VideoSceneGradientColorStop[] | null | undefined,
  fallbackFrom: string,
  fallbackTo: string
): VideoSceneGradientColorStop[] {
  return normalizeGradientStops(
    stops,
    createVideoSceneGradientFallbackStops(fallbackFrom, fallbackTo)
  );
}

export function resolveVideoSceneGradientEndpointColors(
  stops: readonly VideoSceneGradientColorStop[],
  fallbackFrom: string,
  fallbackTo: string
) {
  const normalized = normalizeVideoSceneGradientStops(stops, fallbackFrom, fallbackTo);
  return {
    from: normalized[0]?.color ?? fallbackFrom,
    to: normalized.at(-1)?.color ?? fallbackTo,
  };
}

export function createVideoSceneGradientColorStopColor(stop: VideoSceneGradientColorStop): string {
  return createGradientColorStopColor(stop);
}

export function createVideoSceneGradientCssStops(
  stops: readonly VideoSceneGradientColorStop[],
  range: { fromStop: number; toStop: number } = { fromStop: 0, toStop: 100 }
): string {
  const span = range.toStop - range.fromStop;
  return stops
    .map((stop) => {
      const percent = range.fromStop + clampGradientOffset(stop.offset) * span;
      return `${createVideoSceneGradientColorStopColor(stop)} ${Math.round(percent)}%`;
    })
    .join(', ');
}

export function addVideoSceneGradientStop(
  stops: readonly VideoSceneGradientColorStop[],
  selectedIndex: number
): VideoSceneGradientColorStop[] {
  return addGradientStop(
    stops,
    selectedIndex,
    createVideoSceneGradientFallbackStops('#ffffff', '#000000')
  );
}

export function removeVideoSceneGradientStop(
  stops: readonly VideoSceneGradientColorStop[],
  selectedIndex: number
): VideoSceneGradientColorStop[] {
  return removeGradientStop(
    stops,
    selectedIndex,
    createVideoSceneGradientFallbackStops('#ffffff', '#000000')
  );
}

export function reverseVideoSceneGradientStops(
  stops: readonly VideoSceneGradientColorStop[]
): VideoSceneGradientColorStop[] {
  return reverseGradientStops(stops, createVideoSceneGradientFallbackStops('#ffffff', '#000000'));
}

export function updateVideoSceneGradientStop(
  stops: readonly VideoSceneGradientColorStop[],
  selectedIndex: number,
  patch: Partial<VideoSceneGradientColorStop>
): VideoSceneGradientColorStop[] {
  return normalizeVideoSceneGradientStops(
    stops.map((stop, index) =>
      index === selectedIndex
        ? {
            color: patch.color ?? stop.color,
            offset: clampGradientOffset(patch.offset ?? stop.offset),
            ...('opacity' in patch || stop.opacity !== undefined
              ? { opacity: clampGradientOpacity(patch.opacity ?? stop.opacity ?? 1) }
              : {}),
          }
        : stop
    ),
    '#ffffff',
    '#000000'
  );
}
