import { expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import type { VideoCompositionVisualLayer } from './types';

const scratch = vi.hoisted(() => ({
  acquire: vi.fn(),
  spotlight: vi.fn(),
}));
vi.mock('./canvas/buffer-pool', () => ({ acquireVideoCompositionBuffer: scratch.acquire }));
vi.mock('./draw/project-spotlight', () => ({ drawCompositionSceneSpotlights: scratch.spotlight }));

import {
  drawDeferredCameraSplitSpotlights,
  paintCameraSplitScreen,
  resolveActiveCameraSplit,
} from './camera-split';

it('selects only a visible split camera layer', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'screen.webm',
    width: 640,
    height: 360,
    duration: 10,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO') throw new Error('Missing video clip');
  const camera = {
    kind: 'video',
    trackRole: 'CAMERA',
    opacity: 1,
    clipId: clip.id,
  } as VideoCompositionVisualLayer;
  expect(resolveActiveCameraSplit(project, 0, [camera])).toBeNull();
  const split = {
    ...project,
    clips: project.clips.map((item) =>
      item.id === clip.id ? { ...clip, cameraSplit: 'left' as const } : item
    ),
  };
  expect(resolveActiveCameraSplit(split, 0, [camera])).toMatchObject({
    clipId: clip.id,
    screen: { x: 0.51, width: 0.49 },
  });
  for (const skipped of [
    { ...camera, kind: 'image' },
    { ...camera, trackRole: 'SCREEN' },
    { ...camera, opacity: 0 },
    { ...camera, clipId: 'missing' },
  ] as VideoCompositionVisualLayer[]) {
    expect(resolveActiveCameraSplit(split, 0, [skipped])).toBeNull();
  }
});

it('copies the composed screen into its pane and preserves the output canvas state', () => {
  const source = { clearRect: vi.fn(), drawImage: vi.fn() };
  const buffer = { getContext: vi.fn(() => source), width: 1920, height: 1080 };
  const release = vi.fn();
  scratch.acquire.mockReturnValue({ canvas: buffer, release });
  const canvas = { width: 1920, height: 1080 };
  const context = {
    canvas,
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  paintCameraSplitScreen(
    context as unknown as CanvasRenderingContext2D,
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 0.51, y: 0, width: 0.49, height: 1 }
  );
  expect(source.drawImage).toHaveBeenCalledExactlyOnceWith(canvas, 0, 0);
  expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 1920, 1080);
  expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
    buffer,
    0,
    0,
    1920,
    1080,
    979.2,
    0,
    940.8,
    1080
  );
  expect(context.restore).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it('fails clearly when the split scratch cannot be acquired or painted', () => {
  const context = { canvas: { width: 100, height: 50 } } as CanvasRenderingContext2D;
  const viewport = { x: 0, y: 0, width: 100, height: 50 };
  const screen = { x: 0.51, y: 0, width: 0.49, height: 1 };
  scratch.acquire.mockReturnValue(null);
  expect(() => paintCameraSplitScreen(context, viewport, screen)).toThrow('buffer is unavailable');
  const release = vi.fn();
  scratch.acquire.mockReturnValue({ canvas: { getContext: () => null }, release });
  expect(() => paintCameraSplitScreen(context, viewport, screen)).toThrow('context is unavailable');
  expect(release).toHaveBeenCalledOnce();
});

it('limits repeated global and camera-bound spotlight masks to the deferred camera pane', () => {
  scratch.spotlight.mockClear();
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const split = {
    clipId: 'camera',
    camera: { x: 0, y: 0, width: 0.49, height: 1 },
  } as NonNullable<ReturnType<typeof resolveActiveCameraSplit>>;
  const args = {
    context,
    split,
    frame: {
      sceneSpotlights: [
        { afterClipId: undefined },
        { afterClipId: 'camera' },
        { afterClipId: 'screen' },
      ],
    },
    project: {},
    images: {},
    viewport: { x: 10, y: 20, width: 200, height: 100 },
    composition: { x: 10, y: 20, scale: 1 },
  } as unknown as Parameters<typeof drawDeferredCameraSplitSpotlights>[0];
  drawDeferredCameraSplitSpotlights(args);
  expect(context.rect).toHaveBeenCalledWith(10, 20, 98, 100);
  expect(context.clip).toHaveBeenCalledOnce();
  expect(scratch.spotlight).toHaveBeenCalledTimes(2);
  expect(scratch.spotlight.mock.calls.map(([value]) => value.afterClipId)).toEqual([
    undefined,
    'camera',
  ]);
  expect(context.restore).toHaveBeenCalledOnce();
  scratch.spotlight.mockClear();
  drawDeferredCameraSplitSpotlights({
    ...args,
    frame: { sceneSpotlights: [{ afterClipId: 'screen' }] },
  } as unknown as typeof args);
  expect(scratch.spotlight).not.toHaveBeenCalled();
});

it.each([
  ['left', 0, 0, 0.49, 1],
  ['right', 0.51, 0, 0.49, 1],
  ['top', 0, 0, 1, 0.49],
  ['bottom', 0, 0.51, 1, 0.49],
] as const)(
  'clips real %s split geometry to the camera pane at a scaled viewport',
  (side, x, y, width, height) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'source',
      filename: 'screen.webm',
      width: 640,
      height: 360,
      duration: 10,
      mimeType: 'video/webm',
      size: 100,
    });
    const clip = project.clips.find((item) => item.type === 'VIDEO');
    if (!clip || clip.type !== 'VIDEO') throw new Error('Missing video clip');
    clip.cameraSplit = side;
    const layer = {
      kind: 'video',
      trackRole: 'CAMERA',
      opacity: 1,
      clipId: clip.id,
    } as VideoCompositionVisualLayer;
    const split = resolveActiveCameraSplit(project, 0, [layer]);
    expect(split).not.toBeNull();
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    };
    const args = {
      context,
      split,
      project,
      frame: { sceneSpotlights: [{ afterClipId: undefined }] },
      images: {},
      viewport: { x: 10, y: 20, width: 320, height: 180 },
      composition: { x: 10, y: 20, scale: 0.5 },
    } as unknown as Parameters<typeof drawDeferredCameraSplitSpotlights>[0];
    drawDeferredCameraSplitSpotlights(args);
    const rectangle = context.rect.mock.calls.at(-1)!;
    for (const [index, expected] of [
      10 + x * 320,
      20 + y * 180,
      width * 320,
      height * 180,
    ].entries()) {
      expect(rectangle[index]).toBeCloseTo(expected, 8);
    }
  }
);
