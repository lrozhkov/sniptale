import { expect, it, vi } from 'vitest';
import { drawRoundedRectPath, wrapText } from './shared';

function createContext() {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('wraps text and keeps empty paragraphs as explicit lines', () => {
  const context = createContext();

  expect(wrapText(context, 'alpha beta\n\ngamma', '600 16px Test', 42)).toEqual([
    'alpha',
    'beta',
    '',
    'gamma',
  ]);
  expect(wrapText(context, 'alpha beta', '600 16px Test', 200)).toEqual(['alpha beta']);
});

it('draws rounded rectangle paths with a clamped radius', () => {
  const context = createContext();

  drawRoundedRectPath(context, 10, 20, 30, 16, 20);

  expect(context.beginPath).toHaveBeenCalledTimes(1);
  expect(context.moveTo).toHaveBeenCalledWith(18, 20);
  expect(context.closePath).toHaveBeenCalledTimes(1);
});
