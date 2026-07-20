import { expect, it, vi } from 'vitest';
import { drawTransitionOverlay } from './transition';

function createContext() {
  const createLinearGradient = vi.fn((_x0: number, _y0: number, _x1: number, _y1: number) => ({
    addColorStop: vi.fn(),
  }));

  return {
    context: {
      createLinearGradient,
      fillRect: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
    } as unknown as CanvasRenderingContext2D,
    createLinearGradient,
  };
}

it('draws fill transition overlays as full-frame color washes', () => {
  const { context } = createContext();

  drawTransitionOverlay(
    context,
    {
      alpha: 0.6,
      color: '#ff8800',
      direction: 'LEFT',
      kind: 'fill',
      progress: 0.4,
      softness: 0,
      transitionId: 'transition-1',
      width: 1,
    },
    1280,
    720,
    0.5
  );

  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1280, 720);
  expect(context.globalAlpha).toBe(0.3);
  expect(context.fillStyle).toBe('#ff8800');
});

it('draws sweep transition overlays through a gradient band', () => {
  const gradient = { addColorStop: vi.fn() };
  const createLinearGradient = vi.fn(
    (_x0: number, _y0: number, _x1: number, _y1: number) => gradient
  );
  const context = {
    ...createContext().context,
    createLinearGradient,
  } as unknown as CanvasRenderingContext2D;

  drawTransitionOverlay(
    context,
    {
      alpha: 0.5,
      color: '#22ccff',
      direction: 'RIGHT',
      kind: 'sweep',
      progress: 0.3,
      softness: 0.45,
      transitionId: 'transition-1',
      width: 0.2,
    },
    1920,
    1080
  );

  expect(createLinearGradient).toHaveBeenCalledTimes(1);
  expect(gradient.addColorStop).toHaveBeenCalledTimes(5);
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
});

it('supports reverse and vertical sweep directions', () => {
  const gradient = { addColorStop: vi.fn() };
  const createLinearGradient = vi.fn(
    (_x0: number, _y0: number, _x1: number, _y1: number) => gradient
  );
  const context = {
    ...createContext().context,
    createLinearGradient,
  } as unknown as CanvasRenderingContext2D;

  drawTransitionOverlay(
    context,
    {
      alpha: 0.4,
      color: '#22ccff',
      direction: 'UP',
      kind: 'sweep',
      progress: 0.8,
      softness: 0.3,
      transitionId: 'transition-1',
      width: 0.12,
    },
    1280,
    720
  );

  const gradientCall = createLinearGradient.mock.calls[0];

  if (!gradientCall) {
    throw new Error('Expected gradient call');
  }

  const [x0, y0, x1, y1] = gradientCall;
  expect(x0).toBe(0);
  expect(y0).toBeCloseTo(57.6);
  expect(x1).toBe(0);
  expect(y1).toBeCloseTo(230.4);
  expect(gradient.addColorStop).toHaveBeenCalledTimes(5);
});
