import { expect, it, vi } from 'vitest';

import type { RuntimeCanvas } from '../model/types';
import { createPassContext } from '../interpreter/support.test-support';
import { createEffectRuntimeCanvasPool } from './pool';

it('reuses a released keyed canvas only after resetting its drawing state', () => {
  const context = createContext();
  const canvas: RuntimeCanvas = { getContext: () => context, height: 10, width: 10 };
  const createCanvas = vi.fn(() => canvas);
  const pool = createEffectRuntimeCanvasPool({ createCanvas, maxEntries: 2 });

  const first = pool.lease({ effectInstanceId: 'effect-1', height: 10, slot: 0, width: 10 });
  first.release();
  const second = pool.lease({ effectInstanceId: 'effect-1', height: 10, slot: 0, width: 10 });

  expect(second.canvas).toBe(canvas);
  expect(createCanvas).toHaveBeenCalledOnce();
  expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  expect(context.clearRect).toHaveBeenCalledWith(0, 0, 10, 10);
});

it('never lends the same canvas to overlapping frame leases', () => {
  const createCanvas = vi.fn((width: number, height: number) => ({
    getContext: () => createContext(),
    height,
    width,
  }));
  const pool = createEffectRuntimeCanvasPool({ createCanvas, maxEntries: 2 });

  const first = pool.lease({ effectInstanceId: 'effect-1', height: 10, slot: 0, width: 10 });
  const second = pool.lease({ effectInstanceId: 'effect-1', height: 10, slot: 0, width: 10 });

  expect(second.canvas).not.toBe(first.canvas);
  expect(createCanvas).toHaveBeenCalledTimes(2);
});

const createContext = createPassContext;

it('physically releases cleared surfaces', () => {
  const pool = createEffectRuntimeCanvasPool({
    createCanvas: (width, height) => ({ width, height, getContext: () => createContext() }),
  });
  const lease = pool.lease({ effectInstanceId: 'a', slot: 0, width: 1280, height: 720 });
  lease.release();
  pool.clear();
  expect(lease.canvas.width).toBe(0);
  expect(lease.canvas.height).toBe(0);
});

it('reuses storage without width writes and releases idle surfaces', () => {
  vi.useFakeTimers();
  try {
    let writes = 0;
    let width = 100;
    let height = 100;
    const context = { ...createContext(), reset: vi.fn() };
    const canvas = {
      get width() {
        return width;
      },
      set width(v) {
        writes++;
        width = v;
      },
      get height() {
        return height;
      },
      set height(v) {
        writes++;
        height = v;
      },
      getContext: () => context,
    };
    const pool = createEffectRuntimeCanvasPool({ createCanvas: () => canvas });
    for (let i = 0; i < 90; i++)
      pool.lease({ effectInstanceId: 'same', slot: 0, width: 100, height: 100 }).release();
    expect(writes).toBe(0);
    expect(context.reset).toHaveBeenCalledTimes(90);
    vi.advanceTimersByTime(1000);
    expect(width).toBe(0);
    expect(height).toBe(0);
    expect(pool.snapshot().entries).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('releases evicted pixels and limits retained idle bytes', () => {
  const pool = createEffectRuntimeCanvasPool({
    maxEntries: 2,
    createCanvas: (width, height) => ({ width, height, getContext: () => createContext() }),
  });
  const a = pool.lease({ effectInstanceId: 'a', slot: 0, width: 3000, height: 3000 });
  a.release();
  const b = pool.lease({ effectInstanceId: 'b', slot: 0, width: 3000, height: 3000 });
  b.release();
  expect(a.canvas.width).toBe(0);
  expect(pool.snapshot().entries).toBe(1);
  pool.clear();
  expect(b.canvas.width).toBe(0);
});
