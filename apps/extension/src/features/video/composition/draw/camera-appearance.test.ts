import { expect, it, vi } from 'vitest';
import { DEFAULT_CAMERA_APPEARANCE } from '../../project/camera/appearance';
import { drawFittedMediaLayer, drawCameraMediaSource } from './fitted-media';
import { traceCameraShape } from './media-shadow';

it('clips the source to a rounded window while cropping without stretching', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const render = vi.fn();
  drawFittedMediaLayer({
    context,
    displayScale: 1,
    fitMode: 'CONTAIN',
    frame: { x: 10, y: 20, width: 200, height: 100 },
    cameraAppearance: { ...DEFAULT_CAMERA_APPEARANCE, roundness: 40, zoom: 2, panX: 1, panY: -1 },
    sourceWidth: 200,
    sourceHeight: 100,
    shadowIntensity: 0,
    shadowMode: undefined,
    render,
  });
  expect(context.roundRect).toHaveBeenCalledWith(10, 20, 200, 100, 20);
  expect(context.clip).toHaveBeenCalledOnce();
  expect(render).toHaveBeenCalledWith(-190, 20, 400, 200);
  expect(context.restore).toHaveBeenCalledOnce();
});

it('uses the same closed silhouette for shadow masks at nonzero offsets', () => {
  const context = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  traceCameraShape(
    context,
    { x: 20, y: 30, width: 100, height: 60 },
    { ...DEFAULT_CAMERA_APPEARANCE, shape: 'soft' }
  );
  expect(context.moveTo).toHaveBeenCalledWith(120, 60);
  expect(context.lineTo).toHaveBeenCalledTimes(127);
  expect(context.closePath).toHaveBeenCalledOnce();
});

it('reflects source pixels about the camera window and restores context after failure', () => {
  const context = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn() };
  const render = vi.fn();
  const frame = { x: 20, y: 40, width: 160, height: 90 };
  drawCameraMediaSource(context as unknown as CanvasRenderingContext2D, frame, false, render);
  expect(context.save).not.toHaveBeenCalled();
  expect(render).toHaveBeenCalledOnce();
  expect(() =>
    drawCameraMediaSource(context as unknown as CanvasRenderingContext2D, frame, true, () => {
      expect(context.translate).toHaveBeenCalledWith(200, 0);
      expect(context.scale).toHaveBeenCalledWith(-1, 1);
      throw new Error('Source unavailable');
    })
  ).toThrow('Source unavailable');
  expect(context.restore).toHaveBeenCalledOnce();
});

it('passes authored color to the shared shadow mask without tinting source pixels', async () => {
  const { createVisualTestContext } = await import('./visual.test-support');
  for (const camera of [false, true])
    for (const shadowMode of ['BACKDROP', 'GLOW'] as const) {
      const context = createVisualTestContext();
      const source = vi.fn(() => expect(context.globalAlpha).toBe(1));
      drawFittedMediaLayer({
        context,
        displayScale: 1,
        fitMode: 'STRETCH',
        frame: { x: 10, y: 20, width: 100, height: 80 },
        camera,
        shadowIntensity: 60,
        shadowMode,
        shadowColor: '#ff000080',
        sourceWidth: 100,
        sourceHeight: 80,
        render: source,
      });
      expect(Reflect.get(context.__maskContext, 'shadowColor')).toBe('#ff000080');
      expect(source).toHaveBeenCalledOnce();
      expect(context.globalAlpha).toBe(1);
    }
  const context = createVisualTestContext();
  drawFittedMediaLayer({
    context,
    displayScale: 1,
    fitMode: 'STRETCH',
    frame: { x: 10, y: 20, width: 100, height: 80 },
    shadowIntensity: 0,
    shadowMode: undefined,
    shadowColor: '#ff0000',
    sourceWidth: 100,
    sourceHeight: 80,
    render: vi.fn(),
  });
  expect(context.__maskContext.fillRect).not.toHaveBeenCalled();
});

it('crops and masks a circle inside the original nonsquare frame for native and decoded drawing', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const render = vi.fn();
  const frame = { x: 10, y: 20, width: 200, height: 100 };
  drawFittedMediaLayer({
    context,
    displayScale: 1,
    fitMode: 'CONTAIN',
    frame,
    cameraAppearance: { ...DEFAULT_CAMERA_APPEARANCE, shape: 'circle' },
    shadowIntensity: 0,
    shadowMode: undefined,
    sourceWidth: 200,
    sourceHeight: 100,
    render,
  });
  expect(render).toHaveBeenCalledWith(10, 20, 200, 100);
  expect(context.moveTo).toHaveBeenCalledWith(160, 70);
  expect(context.clip).toHaveBeenCalledOnce();
  expect(frame).toEqual({ x: 10, y: 20, width: 200, height: 100 });
});
