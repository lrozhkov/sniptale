import { expect, it, vi } from 'vitest';
import { drawPointerFeedbackFrame } from './pointer-feedback';
import type { ReviewClickFrame } from '../../review/click-animation';

function surface() {
  const original = {
    globalAlpha: 0.4,
    fillStyle: '#fff',
    strokeStyle: '#000',
    lineWidth: 9,
    shadowColor: '#333',
    shadowBlur: 0,
    shadowOffsetY: 0,
  };
  const stack: (typeof original)[] = [];
  const strokes: number[] = [];
  const context = {
    ...original,
    save: vi.fn((): void => {
      stack.push({
        globalAlpha: context.globalAlpha,
        fillStyle: context.fillStyle,
        strokeStyle: context.strokeStyle,
        lineWidth: context.lineWidth,
        shadowColor: context.shadowColor,
        shadowBlur: context.shadowBlur,
        shadowOffsetY: context.shadowOffsetY,
      });
    }),
    restore: vi.fn((): void => {
      const state = stack.pop();
      if (!state) throw new Error('Unbalanced canvas.');
      Object.assign(context, state);
    }),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    roundRect: vi.fn(),
    stroke: vi.fn(() => {
      strokes.push(context.globalAlpha);
    }),
    fill: vi.fn(),
    strokeRect: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  return {
    context,
    canvas: context as unknown as CanvasRenderingContext2D,
    original,
    stack,
    strokes,
  };
}
function lens(point = { x: 40, y: 50 }): ReviewClickFrame {
  return {
    effect: 'magnify',
    point,
    radius: 20,
    stroke: 3,
    color: '#ff0000ff',
    opacity: 0.2,
    lens: { scale: 2, shape: 'circle', shadow: 10 },
  };
}

it('inherits layer opacity for original lens pixels and applies cue opacity only to its outline', () => {
  const { canvas, context, original, stack, strokes } = surface();
  const source = {
    rect: { x: 0, y: 0, width: 100, height: 100 },
    draw: vi.fn(() => expect(context.globalAlpha).toBe(0.4)),
  };
  const frame = lens(),
    before = structuredClone(frame);
  drawPointerFeedbackFrame(canvas, frame, source);
  expect(source.draw).toHaveBeenCalledExactlyOnceWith(context, -40, -50, 200, 200);
  expect(strokes).toHaveLength(1);
  expect(strokes[0]).toBeCloseTo(0.08, 12);
  expect(context.globalAlpha).toBe(original.globalAlpha);
  expect(context.lineWidth).toBe(original.lineWidth);
  expect(context.shadowBlur).toBe(original.shadowBlur);
  expect(stack).toHaveLength(0);
  expect(frame).toEqual(before);
});

it('restores every nested drawing state when the original source fails', () => {
  const { canvas, context, original, stack } = surface();
  const source = {
    rect: { x: 0, y: 0, width: 100, height: 100 },
    draw: vi.fn(() => {
      throw new Error('Unavailable source.');
    }),
  };
  expect(() => drawPointerFeedbackFrame(canvas, lens(), source)).toThrow('Unavailable source.');
  expect(stack).toHaveLength(0);
  for (const key of Object.keys(original) as (keyof typeof original)[])
    expect(context[key]).toBe(original[key]);
});

it('starts each overlapping lens from the original source and the unmodified layer state', () => {
  const { canvas, context, stack } = surface();
  const opacities: number[] = [];
  const source = {
    rect: { x: 0, y: 0, width: 100, height: 100 },
    draw: vi.fn(() => {
      opacities.push(context.globalAlpha);
    }),
  };
  drawPointerFeedbackFrame(canvas, lens(), source);
  drawPointerFeedbackFrame(canvas, lens({ x: 60, y: 50 }), source);
  expect(source.draw).toHaveBeenNthCalledWith(1, context, -40, -50, 200, 200);
  expect(source.draw).toHaveBeenNthCalledWith(2, context, -60, -50, 200, 200);
  expect(opacities).toEqual([0.4, 0.4]);
  expect(stack).toHaveLength(0);
});

it('does not substitute an opaque marker for a missing or identity lens source', () => {
  const { canvas, context } = surface();
  drawPointerFeedbackFrame(canvas, lens());
  const frame = lens();
  frame.lens!.scale = 1;
  const source = { rect: { x: 0, y: 0, width: 100, height: 100 }, draw: vi.fn() };
  drawPointerFeedbackFrame(canvas, frame, source);
  expect(context.fill).not.toHaveBeenCalled();
  expect(source.draw).not.toHaveBeenCalled();
  expect(context.save).not.toHaveBeenCalled();
  expect(context.globalAlpha).toBe(0.4);
});
