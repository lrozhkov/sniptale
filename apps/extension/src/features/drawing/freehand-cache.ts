import type { DrawingPoint, DrawingSample } from './model';

const outlineCache = new WeakMap<readonly DrawingSample[], Map<string, DrawingPoint[]>>();

/** Disposable geometry acceleration; drawing samples remain the authoritative state. */
export function memoizeDrawingStrokeOutline(
  samples: readonly DrawingSample[],
  key: string,
  create: () => DrawingPoint[]
): DrawingPoint[] {
  const cached = outlineCache.get(samples)?.get(key);
  if (cached) return cached;
  const outline = create();
  const entries = outlineCache.get(samples) ?? new Map<string, DrawingPoint[]>();
  entries.set(key, outline);
  outlineCache.set(samples, entries);
  return outline;
}
