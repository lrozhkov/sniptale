import { cameraShadowLocalOffset } from '../../project/camera/shadow-direction';
import { afterEach, expect, it, vi } from 'vitest';
import { VideoMediaShadowMode } from '../../project/types/index';
import { drawMediaFrameShadow } from './media-shadow';

function createContext() {
  const maskContext = {
    fillRect: vi.fn(),
    globalCompositeOperation: 'source-over',
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
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
    setTransform: vi.fn(),
    clearRect: vi.fn(),
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
  expect(context.__maskContext.fillRect).toHaveBeenCalledWith(77, 77, 120, 80);
  expect(context.__maskContext.globalCompositeOperation).toBe('destination-out');
  expect(context.__maskContext.shadowColor).toBe('rgba(0, 0, 0, 0.5)');
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
    setTransform: vi.fn(),
    clearRect: vi.fn(),
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
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    ...overrides,
  } as unknown as CanvasRenderingContext2D & {
    drawImage: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
  };
}

it.each(['rounded', 'soft', 'ellipse'] as const)(
  'reuses and clears the camera %s mask between frames',
  (shape) => {
    const context = createContext();
    const mask = context.__maskContext;
    const fill = vi.fn();
    const beginPath = vi.fn();
    Object.assign(mask, {
      fill,
      beginPath,
      roundRect: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
    });
    const frame = { height: 80, width: 120, x: 6, y: 8 };
    for (let i = 0; i < 3; i++)
      drawMediaFrameShadow(
        context,
        50,
        VideoMediaShadowMode.GLOW,
        frame,
        2,
        { shape, roundness: 50, zoom: 1, panX: 0, panY: 0 },
        true
      );
    expect(context.canvas.ownerDocument.createElement).toHaveBeenCalledTimes(1);
    expect(mask.clearRect).toHaveBeenCalledTimes(3);
    expect(beginPath).toHaveBeenCalledTimes(6);
    expect(fill).toHaveBeenCalledTimes(6);
    expect(mask.restore).toHaveBeenCalledTimes(3);
  }
);

it('applies the authored color and intensity to an exterior-only camera shadow', () => {
  const context = createContext();
  context.globalAlpha = 1;
  const mask = context.__maskContext;
  Object.assign(mask, {
    fill: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
  });
  drawMediaFrameShadow(
    context,
    40,
    undefined,
    { x: 0, y: 0, width: 100, height: 100 },
    1,
    { shape: 'ellipse', roundness: 0, zoom: 1, panX: 0, panY: 0 },
    true,
    '#11223380'
  );
  expect(mask.shadowColor).toBe('#11223380');
  expect(context.globalAlpha).toBe(0.4);
  expect(mask.globalCompositeOperation).toBe('destination-out');
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(context.fillRect).not.toHaveBeenCalled();
});

it('uses the same rounded silhouette for shadow paint and interior subtraction', () => {
  const context = createContext();
  const mask = context.__maskContext;
  const roundRect = vi.fn(),
    fill = vi.fn();
  Object.assign(mask, { beginPath: vi.fn(), roundRect, fill });
  drawMediaFrameShadow(
    context,
    50,
    undefined,
    { x: 10, y: 20, width: 120, height: 80 },
    1,
    undefined,
    false,
    '#11223380',
    18
  );
  expect(roundRect).toHaveBeenCalledTimes(2);
  expect(roundRect.mock.calls[0]).toEqual(roundRect.mock.calls[1]);
  expect(roundRect.mock.calls[0]!.slice(2)).toEqual([120, 80, 18]);
  expect(mask.fillRect).not.toHaveBeenCalled();
  expect(fill).toHaveBeenCalledTimes(2);
  expect(mask.globalCompositeOperation).toBe('destination-out');
  expect(context.drawImage).toHaveBeenCalledOnce();
});

it.each(['BACKDROP', 'GLOW'] as const)(
  'keeps explicit %s shadow scene direction after rotation and anisotropic scale',
  (mode) => {
    const context = createContext();
    context.getTransform = vi.fn(() => ({ a: 0, b: 3, c: -2, d: 0 }) as DOMMatrix);
    const offsets: { x: number; y: number }[] = [];
    context.__maskContext.fillRect.mockImplementation(() => {
      offsets.push({
        x: context.__maskContext.shadowOffsetX,
        y: context.__maskContext.shadowOffsetY,
      });
    });
    drawMediaFrameShadow(
      context,
      50,
      mode,
      { x: 0, y: 0, width: 120, height: 80 },
      1,
      undefined,
      true,
      undefined,
      0,
      cameraShadowLocalOffset({ x: 1, y: 0 }, 1, { a: 0, b: 3, c: -2, d: 0 })!
    );
    expect(context.getTransform).not.toHaveBeenCalled();
    expect(offsets[0]).toEqual({ x: 0, y: -2.25 });
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
  }
);
it.each([1e-12])(
  'skips unallocatable directional shadow for scale %s while leaving its receiver usable',
  (scale) => {
    const context = createContext();
    context.getTransform = vi.fn(() => ({ a: scale, b: 0, c: 0, d: scale }) as DOMMatrix);
    drawMediaFrameShadow(
      context,
      50,
      undefined,
      { x: 0, y: 0, width: 120, height: 80 },
      1,
      undefined,
      true,
      undefined,
      0,
      { x: 1 / scale, y: 0 }
    );
    expect(context.getTransform).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.save).not.toHaveBeenCalled();
  }
);
it('preserves the receiver when an optional directional shadow cannot acquire a bitmap', () => {
  const context = createContext();
  context.getTransform = vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1 }) as DOMMatrix);
  vi.spyOn(context.canvas.ownerDocument!, 'createElement').mockImplementation(() => {
    throw new Error('unavailable');
  });
  expect(() =>
    drawMediaFrameShadow(
      context,
      50,
      undefined,
      { x: 0, y: 0, width: 123, height: 87 },
      1,
      undefined,
      true,
      undefined,
      0,
      { x: 1, y: 0 }
    )
  ).not.toThrow();
  expect(context.restore).toHaveBeenCalledOnce();
});
