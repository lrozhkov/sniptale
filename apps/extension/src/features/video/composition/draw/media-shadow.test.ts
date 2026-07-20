import { afterEach, expect, it, vi } from 'vitest';
import { VideoMediaShadowMode } from '../../project/types/index';
import { drawMediaFrameShadow } from './media-shadow';

function createContext() {
  const maskContext = {
    fillRect: vi.fn(),
    globalCompositeOperation: 'source-over',
    restore: vi.fn(),
    save: vi.fn(),
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  const maskCanvas = {
    getContext: vi.fn(() => maskContext),
    height: 0,
    width: 0,
  };
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    canvas: {
      ownerDocument: {
        createElement: vi.fn(() => maskCanvas),
      },
    },
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetY: 0,
    strokeRect: vi.fn(),
    __maskContext: maskContext,
  } as unknown as CanvasRenderingContext2D & { __maskContext: typeof maskContext };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('draws backdrop as an outer frame shadow without painting under clip content', () => {
  const context = createContext();

  drawMediaFrameShadow(context, 50, undefined, { height: 80, width: 120, x: 6, y: 8 }, 2);

  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.drawImage).toHaveBeenCalledTimes(1);
  expect(context.__maskContext.fillRect).toHaveBeenCalledWith(50, 50, 120, 80);
  expect(context.__maskContext.globalCompositeOperation).toBe('destination-out');
  expect(context.__maskContext.shadowColor).toBe('rgba(0, 0, 0, 0.28)');
  expect(context.__maskContext.shadowOffsetY).toBe(0);
  expect(context.shadowBlur).toBe(0);
  expect(context.shadowOffsetY).toBe(0);
});

it('skips zero-strength media shadows without touching the canvas context', () => {
  const context = createContext();

  drawMediaFrameShadow(context, 0, undefined, { height: 80, width: 120, x: 6, y: 8 }, 2);

  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.save).not.toHaveBeenCalled();
});

it('draws glow as an outer frame shadow without painting under clip content', () => {
  const context = createContext();

  drawMediaFrameShadow(
    context,
    50,
    VideoMediaShadowMode.GLOW,
    { height: 80, width: 120, x: 6, y: 8 },
    2
  );

  expect(context.fillRect).not.toHaveBeenCalled();
  expect(context.strokeRect).not.toHaveBeenCalled();
  expect(context.drawImage).toHaveBeenCalledTimes(1);
  expect(context.__maskContext.fillRect).toHaveBeenCalledTimes(2);
  expect(context.__maskContext.fillRect).toHaveBeenCalledWith(60, 60, 120, 80);
  expect(context.__maskContext.globalCompositeOperation).toBe('destination-out');
  expect(context.__maskContext.shadowColor).toBe('rgba(255, 255, 255, 0.34)');
  expect(context.__maskContext.shadowOffsetY).toBe(0);
  expect(context.shadowBlur).toBe(0);
  expect(context.shadowOffsetY).toBe(0);
});

it('draws glow masks with OffscreenCanvas when no owner document exists', () => {
  const maskContext = {
    fillRect: vi.fn(),
    globalCompositeOperation: 'source-over',
    restore: vi.fn(),
    save: vi.fn(),
  };
  class FakeOffscreenCanvas {
    height: number;
    width: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }

    getContext() {
      return maskContext;
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  const context = createContextWithoutMaskCanvas();

  drawMediaFrameShadow(
    context,
    50,
    VideoMediaShadowMode.GLOW,
    { height: 80, width: 120, x: 6, y: 8 },
    2
  );

  expect(context.drawImage).toHaveBeenCalledTimes(1);
  expect(maskContext.fillRect).toHaveBeenCalledTimes(2);
});

it('skips glow masks when no mask canvas context is available', () => {
  const context = createContextWithoutMaskCanvas({
    canvas: {
      ownerDocument: {
        createElement: vi.fn(() => ({
          getContext: vi.fn(() => null),
          height: 0,
          width: 0,
        })),
      },
    },
  });

  drawMediaFrameShadow(
    context,
    50,
    VideoMediaShadowMode.GLOW,
    { height: 80, width: 120, x: 6, y: 8 },
    2
  );

  expect(context.drawImage).not.toHaveBeenCalled();
  expect(context.fillRect).not.toHaveBeenCalled();
});

function createContextWithoutMaskCanvas(
  overrides: Record<string, unknown> = {}
): CanvasRenderingContext2D & {
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
} {
  return {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    ...overrides,
  } as unknown as CanvasRenderingContext2D & {
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
  };
}
