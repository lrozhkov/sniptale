import { expect, it } from 'vitest';
import { createPassContext } from './interpreter/support.test-support';
import { applyEffectObjectLayout } from './object-layout';
import type { EffectRuntimeGraphFrameContext } from './model/types';

function frame(width: number, height: number): EffectRuntimeGraphFrameContext {
  return {
    assets: {},
    controls: { x: -100, y: -50 },
    createCanvas: () => {
      throw new Error('Unused');
    },
    duration: 2,
    resolveLayer: () => null,
    track: (_id, fallback) => fallback,
    frameIndex: 0,
    height,
    inputFrames: {},
    progress: 0,
    time: 0,
    width,
  };
}

it('keeps a scaled body natural and offsets negative render bounds once', () => {
  const canvas = createPassContext();
  const layout = {
    width: 380,
    height: 120,
    resize: 'scale' as const,
    handles: [{ id: 'tip', label: { en: 'Tip' }, xControl: 'x', yControl: 'y', padding: 16 }],
  };
  const result = applyEffectObjectLayout(layout, frame(992, 372), canvas);
  expect(result).toMatchObject({ width: 380, height: 120 });
  expect(canvas.scale).toHaveBeenCalledWith(2, 2);
  expect(canvas.translate).toHaveBeenCalledWith(232, 132);
  expect(canvas.rect).toHaveBeenCalledWith(-116, -66, 496, 186);
});
it('reflows the graph without scaling the stroke or natural aspect', () => {
  const canvas = createPassContext();
  const input = frame(1000, 120);
  expect(
    applyEffectObjectLayout({ width: 640, height: 280, resize: 'reflow' }, input, canvas)
  ).toBe(input);
  expect(canvas.scale).toHaveBeenCalledWith(1, 1);
  expect(canvas.rect).toHaveBeenCalledWith(0, 0, 1000, 120);
});
