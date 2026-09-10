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
  timer?: ReturnType<typeof setTimeout>;
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
    clear: () => {
      for (const entry of [...entries]) discardCanvas(entries, entry);
    },
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
  clearTimeout(entry.timer);
  resetCanvas(entry.canvas, key.width, key.height);
  entry.leased = true;
  let released = false;
  return {
    canvas: entry.canvas,
    release() {
      if (released) return;
      released = true;
      entry.leased = false;
      if (!entries.includes(entry)) return;
      entry.timer = setTimeout(() => discardCanvas(entries, entry), 1000);
      while (
        entries
          .filter((e) => !e.leased)
          .reduce((sum, e) => sum + e.canvas.width * e.canvas.height * 4, 0) >
        64 * 1024 * 1024
      ) {
        const idle = entries.find((e) => !e.leased);
        if (!idle) break;
        discardCanvas(entries, idle);
      }
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
  const cached =
    entries.find((candidate) => !candidate.leased && candidate.key === cacheKey) ??
    entries.find(
      (candidate) =>
        !candidate.leased &&
        candidate.canvas.width === key.width &&
        candidate.canvas.height === key.height
    );
  if (cached) {
    cached.key = cacheKey;
    entries.splice(entries.indexOf(cached), 1);
    entries.push(cached);
    return cached;
  }
  if (entries.length >= maxEntries) {
    const idleIndex = entries.findIndex((candidate) => !candidate.leased);
    if (idleIndex < 0) throw new EffectRuntimeResourceError();
    discardCanvas(entries, entries[idleIndex]!);
  }
  const canvas = createCanvas(key.width, key.height);
  if (canvas.width !== key.width || canvas.height !== key.height || !canvas.getContext('2d')) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error('CANVAS_CREATION_FAILED');
  }
  const entry = { canvas, key: cacheKey, leased: false };
  entries.push(entry);
  return entry;
}

function resetCanvas(canvas: RuntimeCanvas, width: number, height: number): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
  if (context.reset) context.reset();
  else {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.clearRect(0, 0, width, height);
}

function serializeKey(key: CanvasPoolKey): string {
  return `${key.effectInstanceId}:${key.slot}:${key.width}x${key.height}`;
}

function discardCanvas(entries: CanvasPoolEntry[], entry: CanvasPoolEntry): void {
  clearTimeout(entry.timer);
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
  entry.canvas.width = 0;
  entry.canvas.height = 0;
}
