import { expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { paintReviewCameraSplitScreen, reviewSplitScreenAt } from './camera-split-screen';

it('composes a split pane with one scratch raster and releases it', () => {
  const source = { drawImage: vi.fn() };
  const release = vi.fn();
  const scratch = { canvas: { width: 200, height: 100 }, context: source, release };
  const resources = { canvas: vi.fn(() => scratch) } as unknown as RenderResources;
  const canvas = { width: 200, height: 100 } as HTMLCanvasElement;
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  paintReviewCameraSplitScreen(
    context,
    canvas,
    { width: 200, height: 100 },
    { x: 0.51, y: 0, width: 0.49, height: 1 },
    resources
  );
  expect(resources.canvas).toHaveBeenCalledWith('camera-split-source', { width: 200, height: 100 });
  expect(source.drawImage).toHaveBeenCalledWith(canvas, 0, 0);
  expect(context.drawImage).toHaveBeenCalledWith(scratch.canvas, 102, 0, 98, 100);
  expect(release).toHaveBeenCalledOnce();
});

it('does not allocate a scratch for docked camera or absent camera frame', () => {
  const resources = { canvas: vi.fn() } as unknown as RenderResources;
  const context = {} as CanvasRenderingContext2D;
  const canvas = {} as HTMLCanvasElement;
  paintReviewCameraSplitScreen(context, canvas, { width: 200, height: 100 }, null, resources);
  paintReviewCameraSplitScreen(
    context,
    canvas,
    { width: 200, height: 100 },
    { x: 0, y: 0, width: 1, height: 1 },
    resources
  );
  expect(resources.canvas).not.toHaveBeenCalled();
  expect(reviewSplitScreenAt(undefined, 1, true)).toBeNull();
});
