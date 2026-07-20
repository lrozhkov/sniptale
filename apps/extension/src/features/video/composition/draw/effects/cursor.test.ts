import { expect, it, vi } from 'vitest';
import { drawCursorCompositionState } from './cursor';

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('renders every cursor preset and animation branch', () => {
  const context = createContext();
  const variants = [
    { animationPreset: 'NONE', preset: 'ARROW', shadow: false, time: 0 },
    { animationPreset: 'PULSE', preset: 'DOT', shadow: true, time: 0.25 },
    { animationPreset: 'FLOAT', preset: 'RING', shadow: false, time: 0.5 },
    { animationPreset: 'BREATHE', preset: 'CROSSHAIR', shadow: false, time: 0.75 },
  ] as const;

  for (const variant of variants) {
    drawCursorCompositionState(context, {
      ...variant,
      captureMode: 'embedded-fallback',
      color: '#ffffff',
      scale: 1,
      visible: true,
      x: 20,
      y: 30,
    });
  }

  expect(context.save).toHaveBeenCalledTimes(4);
  expect(context.restore).toHaveBeenCalledTimes(4);
  expect(context.translate).toHaveBeenCalledWith(20, 30);
  expect(context.moveTo).toHaveBeenCalled();
  expect(context.lineTo).toHaveBeenCalled();
  expect(context.arc).toHaveBeenCalled();
  expect(context.scale).toHaveBeenCalledTimes(4);
});

it('returns early for invisible cursor samples', () => {
  const context = createContext();

  drawCursorCompositionState(context, {
    animationPreset: 'NONE',
    captureMode: 'separate',
    color: '#ffffff',
    preset: 'ARROW',
    scale: 1,
    shadow: false,
    time: 0,
    visible: false,
    x: 0,
    y: 0,
  });

  expect(context.save).not.toHaveBeenCalled();
  expect(context.translate).not.toHaveBeenCalled();
});
