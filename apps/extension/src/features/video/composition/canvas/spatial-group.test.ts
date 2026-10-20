// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { drawSpatialCameraGroup } from './spatial-group';
import { createDefaultCameraState } from '../motion/defaults';
import type { VideoCompositionCameraState } from '../types';

function setup() {
  const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  const sourceContext = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const outputContext = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  const surfaces = new Map<string, HTMLCanvasElement>();
  const renderer = {
    surface: vi.fn((kind: string, width: number, height: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      surfaces.set(kind, canvas);
      return { canvas, context: kind === 'exposure' ? outputContext : sourceContext };
    }),
    validateSizes: vi.fn(),
    draw: vi.fn(),
    dispose: vi.fn(),
  };
  const camera: VideoCompositionCameraState = {
    ...createDefaultCameraState({ width: 800, height: 450 }),
    scale: 2,
    viewportX: 50,
    viewportY: 25,
    spatial: {
      rotation: [0, 0, 0, 1],
      perspective: 0,
      windowMotion: 0,
      lockBackground: false,
      focus: [],
      reference: { x: 80, y: 90, width: 560, height: 270 },
    },
  };
  const paint = vi.fn();
  const args = {
    camera,
    context,
    destination: { x: 10, y: 20, width: 800, height: 450 },
    output: { width: 400, height: 225 },
    paint,
    rasterScale: 0.5,
    renderer,
    sourceRect: { x: -20.1, y: -10.2, width: 1000.3, height: 600.4 },
  };
  return { args, renderer, context, sourceContext, outputContext, paint, surfaces };
}

it('captures source overflow with outward pixel rounding and projects once into the consuming viewport', () => {
  const { args, renderer, sourceContext, outputContext, paint, surfaces, context } = setup();
  expect(drawSpatialCameraGroup(args)).toBe(true);
  expect(renderer.validateSizes).toHaveBeenCalledWith(
    { x: -11, y: -6, width: 502, height: 302 },
    { width: 400, height: 225 }
  );
  expect(renderer.surface.mock.calls).toEqual([
    ['exposure', 400, 225],
    ['plane', 502, 302],
  ]);
  expect(sourceContext.translate).toHaveBeenCalledWith(11, 6);
  expect(paint).toHaveBeenCalledWith(sourceContext, 0.5);
  expect(sourceContext.restore).toHaveBeenCalledOnce();
  expect(renderer.draw).toHaveBeenCalledWith(
    outputContext,
    expect.objectContaining({
      sourceRect: { x: -11, y: -6, width: 502, height: 302 },
      base: { x: 40, y: 45, width: 280, height: 135 },
      target: { x: 30, y: 65, width: 560, height: 270 },
    })
  );
  expect(context.drawImage).toHaveBeenCalledWith(surfaces.get('exposure'), 10, 20, 800, 450);
});

it('publishes no partial group after painting GPU or admission failure and permits retry', () => {
  const { args, renderer, context, sourceContext, paint } = setup();
  renderer.validateSizes.mockImplementationOnce(() => {
    throw new Error('admission failed');
  });
  expect(() => drawSpatialCameraGroup(args)).toThrow('admission failed');
  expect(renderer.surface).not.toHaveBeenCalled();
  paint.mockImplementationOnce(() => {
    throw new Error('paint failed');
  });
  expect(() => drawSpatialCameraGroup(args)).toThrow('paint failed');
  expect(sourceContext.restore).toHaveBeenCalledOnce();
  expect(renderer.draw).not.toHaveBeenCalled();
  renderer.draw.mockImplementationOnce(() => {
    throw new Error('GPU lost');
  });
  expect(() => drawSpatialCameraGroup(args)).toThrow('GPU lost');
  expect(context.drawImage).not.toHaveBeenCalled();
  renderer.surface.mockImplementationOnce(() => {
    throw new Error('size refused');
  });
  expect(() => drawSpatialCameraGroup(args)).toThrow('size refused');
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(drawSpatialCameraGroup(args)).toBe(true);
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(renderer.dispose).not.toHaveBeenCalled();
});

it('keeps ordinary camera groups off GPU and refuses invalid spatial geometry', () => {
  const { args, renderer, context } = setup();
  expect(
    drawSpatialCameraGroup({
      ...args,
      camera: createDefaultCameraState({ width: 800, height: 450 }),
    })
  ).toBe(false);
  expect(renderer.surface).not.toHaveBeenCalled();
  expect(() => drawSpatialCameraGroup({ ...args, rasterScale: NaN })).toThrow('bounds');
  expect(() =>
    drawSpatialCameraGroup({ ...args, sourceRect: { ...args.sourceRect, width: Infinity } })
  ).toThrow('bounds');
  expect(() =>
    drawSpatialCameraGroup({
      ...args,
      camera: {
        ...args.camera,
        spatial: {
          ...args.camera.spatial!,
          perspective: 1,
          reference: { x: 0, y: 0, width: 1e-320, height: 1e-320 },
        },
      },
    })
  ).toThrow('reference');
  expect(renderer.surface).not.toHaveBeenCalled();
  expect(context.drawImage).not.toHaveBeenCalled();
});

it('uses a separate sharp source surface and retains the same projection for overlays', () => {
  const { args, renderer } = setup();
  drawSpatialCameraGroup({ ...args, sharp: true });
  expect(renderer.surface.mock.calls[1]).toEqual(['overlay', 502, 302]);
  expect(renderer.draw).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ sharp: true, frame: args.camera.spatial })
  );
});
