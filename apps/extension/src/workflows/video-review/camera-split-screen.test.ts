import {
  createQuickEditWebcam,
  quickEditWebcamScreenPlacementAt,
} from '../../features/video/review/advanced/webcam';
import { expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import {
  paintReviewCameraSplitScreen,
  reviewSplitScreenAt,
  reviewSplitCameraStyle,
} from './camera-split-screen';

it('composes a split pane with one scratch raster and releases it', () => {
  const source = { drawImage: vi.fn() };
  const release = vi.fn();
  const scratch = { canvas: { width: 200, height: 100 }, context: source, release };
  const resources = { canvas: vi.fn(() => scratch) } as unknown as RenderResources;
  const canvas = { width: 200, height: 100 } as HTMLCanvasElement;
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
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

it('restores the drawing context and releases the scratch when shifted raster painting fails', () => {
  const release = vi.fn();
  const resources = {
    canvas: vi.fn(() => ({ canvas: {}, context: { drawImage: vi.fn() }, release })),
  } as unknown as RenderResources;
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(() => {
      throw new Error('raster');
    }),
  } as unknown as CanvasRenderingContext2D;
  expect(() =>
    paintReviewCameraSplitScreen(
      context,
      { width: 200, height: 100 } as HTMLCanvasElement,
      { width: 200, height: 100 },
      { x: 0.255, y: 0, width: 1, height: 1, clip: { x: 0.51, y: 0, width: 0.49, height: 1 } },
      resources
    )
  ).toThrow('raster');
  expect(context.rect).toHaveBeenCalledWith(102, 0, 98, 100);
  expect(context.restore).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it('preserves dock silhouette and shadow with historical splits while Overlay keeps its camera panel', () => {
  const camera = createQuickEditWebcam(
    'project-asset:camera',
    { width: 640, height: 480 },
    { width: 1920, height: 1080 }
  );
  camera.appearance.shape = 'circle';
  camera.shadow = { intensity: 40, color: '#000000' };
  camera.positions = [
    {
      id: 'split',
      time: 2,
      split: 'left',
      screenBehavior: 'overlay',
      placement: camera.placement,
      transition: { type: 'none', duration: 0 },
    },
    {
      id: 'dock',
      time: 4,
      split: null,
      placement: camera.placement,
      transition: { type: 'none', duration: 0 },
    },
  ];
  expect(reviewSplitCameraStyle(camera, quickEditWebcamScreenPlacementAt(camera, 0))).toBe(camera);
  expect(
    reviewSplitCameraStyle(camera, quickEditWebcamScreenPlacementAt(camera, 2)).appearance.shape
  ).toBe('rounded');
  expect(reviewSplitCameraStyle(camera, quickEditWebcamScreenPlacementAt(camera, 4))).toBe(camera);
});

it('restores Gallery dock style at the settled Shift endpoint and keeps it at the next Shift start', () => {
  const camera = createQuickEditWebcam(
    'project-asset:camera',
    { width: 640, height: 480 },
    { width: 1920, height: 1080 }
  );
  camera.split = 'left';
  camera.screenBehavior = 'shift';
  camera.appearance.shape = 'circle';
  camera.shadow = { intensity: 40, color: '#000000' };
  camera.positions = [
    {
      id: 'dock',
      time: 2,
      split: null,
      placement: camera.placement,
      transition: { type: 'ease-in-out', duration: 1 },
    },
    {
      id: 'shift',
      time: 4,
      split: 'right',
      screenBehavior: 'shift',
      placement: camera.placement,
      transition: { type: 'ease-in-out', duration: 1 },
    },
  ];
  for (const time of [3, 4]) {
    const screen = quickEditWebcamScreenPlacementAt(camera, time);
    expect(screen.clip).toBeUndefined();
    expect(reviewSplitCameraStyle(camera, screen)).toBe(camera);
  }
  expect(quickEditWebcamScreenPlacementAt(camera, 2.5).clip).toBeDefined();
  expect(quickEditWebcamScreenPlacementAt(camera, 4.5).clip).toBeDefined();
});
