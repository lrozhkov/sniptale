import { EFFECT_RUNTIME_RESOURCE_LIMITS, EffectRuntimeResourceError } from '../resource-policy';
import type { RuntimeCanvas } from '../model/types';

interface CanvasPoolKey {
  effectInstanceId: string;
  height: number;
  slot: number;
  width: number;
}

interface CanvasPoolEntry {
  canvas: RuntimeCanvas;
  key: string;
  leased: boolean;
}

interface EffectRuntimeCanvasLease {
  canvas: RuntimeCanvas;
  release(): void;
}

export interface EffectRuntimeCanvasPool {
  clear(): void;
  lease(key: CanvasPoolKey): EffectRuntimeCanvasLease;
  snapshot(): { entries: number; leases: number };
}

export function createEffectRuntimeCanvasPool(options: {
  createCanvas(width: number, height: number): RuntimeCanvas;
  maxEntries?: number;
}): EffectRuntimeCanvasPool {
  const entries: CanvasPoolEntry[] = [];
  const maxEntries = Math.max(
    1,
    options.maxEntries ?? EFFECT_RUNTIME_RESOURCE_LIMITS.maxLiveCanvases
  );
  return {
    clear: () => entries.splice(0, entries.length),
    lease: (key) => leaseCanvas(entries, maxEntries, options.createCanvas, key),
    snapshot: () => ({
      entries: entries.length,
      leases: entries.filter(({ leased }) => leased).length,
    }),
  };
}

function leaseCanvas(
  entries: CanvasPoolEntry[],
  maxEntries: number,
  createCanvas: (width: number, height: number) => RuntimeCanvas,
  key: CanvasPoolKey
): EffectRuntimeCanvasLease {
  const entry = resolveCanvasEntry(entries, maxEntries, createCanvas, key);
  resetCanvas(entry.canvas, key.width, key.height);
  entry.leased = true;
  let released = false;
  return {
    canvas: entry.canvas,
    release() {
      if (released) return;
      released = true;
      entry.leased = false;
    },
  };
}

function resolveCanvasEntry(
  entries: CanvasPoolEntry[],
  maxEntries: number,
  createCanvas: (width: number, height: number) => RuntimeCanvas,
  key: CanvasPoolKey
): CanvasPoolEntry {
  const cacheKey = serializeKey(key);
  const cached = entries.find((candidate) => !candidate.leased && candidate.key === cacheKey);
  if (cached) {
    entries.splice(entries.indexOf(cached), 1);
    entries.push(cached);
    return cached;
  }
  if (entries.length >= maxEntries) {
    const idleIndex = entries.findIndex((candidate) => !candidate.leased);
    if (idleIndex < 0) throw new EffectRuntimeResourceError();
    entries.splice(idleIndex, 1);
  }
  const canvas = createCanvas(key.width, key.height);
  if (canvas.width !== key.width || canvas.height !== key.height || !canvas.getContext('2d')) {
    throw new Error('CANVAS_CREATION_FAILED');
  }
  const entry = { canvas, key: cacheKey, leased: false };
  entries.push(entry);
  return entry;
}

function resetCanvas(canvas: RuntimeCanvas, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.clearRect(0, 0, width, height);
}

function serializeKey(key: CanvasPoolKey): string {
  return `${key.effectInstanceId}:${key.slot}:${key.width}x${key.height}`;
}
