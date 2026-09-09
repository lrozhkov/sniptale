import { expect, it, vi } from 'vitest';
import { acquireVideoCompositionBuffer } from './buffer-pool';

it('bounds idle surfaces, expires them, and never shares an active lease', () => {
  vi.useFakeTimers();
  const surfaces: { width: number; height: number }[] = [];
  class Surface {
    constructor(
      public width: number,
      public height: number
    ) {
      surfaces.push(this);
    }
  }
  vi.stubGlobal('OffscreenCanvas', Surface);
  try {
    const first = acquireVideoCompositionBuffer(1280, 720)!;
    const concurrent = acquireVideoCompositionBuffer(1280, 720)!;
    expect(first.canvas).not.toBe(concurrent.canvas);
    first.release();
    first.release();
    const reused = acquireVideoCompositionBuffer(1280, 720)!;
    expect(reused.canvas).toBe(first.canvas);
    reused.release();
    concurrent.release();
    for (let i = 0; i < 6; i++) acquireVideoCompositionBuffer(100 + i, 100)!.release();
    expect(surfaces.filter((s) => s.width > 0)).toHaveLength(4);
    const large = acquireVideoCompositionBuffer(5000, 5000)!;
    large.release();
    expect(large.canvas.width).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(surfaces.every((s) => s.width === 0 && s.height === 0)).toBe(true);
    expect(acquireVideoCompositionBuffer(Number.NaN, 720)).toBeNull();
  } finally {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});

it('evicts old surfaces to keep idle pixel storage under 64 MiB', () => {
  vi.useFakeTimers();
  class Surface {
    constructor(
      public width: number,
      public height: number
    ) {}
  }
  vi.stubGlobal('OffscreenCanvas', Surface);
  try {
    const a = acquireVideoCompositionBuffer(3000, 3000)!;
    a.release();
    const b = acquireVideoCompositionBuffer(3001, 3000)!;
    b.release();
    expect(a.canvas.width).toBe(0);
    expect(b.canvas.width).toBe(3001);
    vi.advanceTimersByTime(1000);
    expect(b.canvas.width).toBe(0);
  } finally {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
