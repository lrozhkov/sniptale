import { expect, it, vi } from 'vitest';
import { DEFAULT_CAMERA_APPEARANCE } from '../../project/camera/appearance';
import { drawFittedMediaLayer } from './fitted-media';
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
