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
