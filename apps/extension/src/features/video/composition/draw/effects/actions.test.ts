import { expect, it, vi } from 'vitest';
import { drawActionCompositionState } from './actions';

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('renders every active action preset and supports fallback points', () => {
  const context = createContext();

  for (const preset of ['CLICK_RIPPLE', 'NONE', 'SPOTLIGHT', 'DWELL_ZOOM']) {
    drawActionCompositionState(
      context,
      {
        duration: 1,
        event: { preset },
        point: preset === 'NONE' ? null : { x: 40, y: 50 },
        progress: 0.5,
        start: 0,
      } as never,
      { x: 42, y: 52 }
    );
  }

  expect(context.save).toHaveBeenCalledTimes(4);
  expect(context.restore).toHaveBeenCalledTimes(4);
  expect(context.arc).toHaveBeenCalled();
  expect(context.createRadialGradient).toHaveBeenCalledTimes(1);
  expect(context.quadraticCurveTo).not.toHaveBeenCalled();
});

it('returns early when neither the action nor fallback supplies a point', () => {
  const context = createContext();

  drawActionCompositionState(
    context,
    {
      duration: 1,
      event: { preset: 'CLICK_RIPPLE' },
      point: null,
      progress: 0.2,
      start: 0,
    } as never,
    null
  );

  expect(context.save).not.toHaveBeenCalled();
  expect(context.arc).not.toHaveBeenCalled();
});

it('scales action overlays with the preview size contract', () => {
  const context = createContext();

  drawActionCompositionState(
    context,
    {
      duration: 1,
      event: { preset: 'CLICK_RIPPLE' },
      point: { x: 40, y: 50 },
      progress: 0.5,
      start: 0,
    } as never,
    null,
    0.5
  );

  expect(context.arc).toHaveBeenCalledWith(40, 50, 16, 0, Math.PI * 2);
  expect(context.lineWidth).toBe(2);
});

it('does not cap large overlay scales in the preview size contract', () => {
  const context = createContext();

  drawActionCompositionState(
    context,
    {
      duration: 1,
      event: { preset: 'CLICK_RIPPLE' },
      point: { x: 40, y: 50 },
      progress: 0.5,
      start: 0,
    } as never,
    null,
    2.5
  );

  expect(context.arc).toHaveBeenCalledWith(40, 50, 80, 0, Math.PI * 2);
  expect(context.lineWidth).toBe(10);
});
