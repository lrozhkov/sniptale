import { afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { createQuickEditSpotlight } from '../../project/scene/focus-appearance';
import { resolveVideoCompositionFrame } from '../timeline/frame';
import { drawSceneSpotlights } from './spotlight';
import { drawVideoLayer } from './video';

vi.mock('./spotlight', () => ({ drawSceneSpotlights: vi.fn() }));
vi.mock('./fitted-media', async (original) => {
  const actual = await original<typeof import('./fitted-media')>();
  return {
    ...actual,
    drawFittedMediaLayer: vi.fn((args: Parameters<typeof actual.drawFittedMediaLayer>[0]) => {
      args.render(args.frame.x, args.frame.y, args.frame.width, args.frame.height, args.context);
    }),
  };
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function fixture(failure?: 'allocate' | 'source' | 'mask' | 'publish') {
  vi.stubGlobal('HTMLVideoElement', class {});
  vi.stubGlobal('HTMLMediaElement', class {});
  const surfaces: { width: number; height: number }[] = [];
  const allocations: { width: number; height: number }[] = [];
  const transform = { a: 2, b: 0, c: 0, d: 2, e: 40, f: 20 };
  const sourceContext = {
    globalAlpha: 1,
    filter: 'none',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    setTransform: vi.fn(),
  };
  const document = {
    createElement: vi.fn(() => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => {
          allocations.push({ width: canvas.width, height: canvas.height });
          return failure === 'allocate' ? null : sourceContext;
        },
      };
      surfaces.push(canvas);
      return canvas;
    }),
  };
  const destination = {
    canvas: { width: 640, height: 360, ownerDocument: document },
    globalAlpha: 0.37,
    filter: 'blur(2px)',
    getTransform: () => transform,
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(() => {
      if (failure === 'publish') throw new Error('publish failed');
    }),
  };
  const source = {
    sourceWidth: 320,
    sourceHeight: 180,
    draw: vi.fn(() => {
      if (failure === 'source') throw new Error('source failed');
    }),
  };
  if (failure === 'mask')
    vi.mocked(drawSceneSpotlights).mockImplementationOnce(() => {
      throw new Error('mask failed');
    });
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 320,
    height: 180,
    duration: 4,
    size: 10,
    mimeType: 'video/webm',
  });
  const clip = project.clips.find((item) => item.type === 'VIDEO')!;
  clip.fitMode = 'STRETCH';
  clip.windowCornerRadius = 0;
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 4,
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'window' as const,
    sourceBinding: {
      clipId: clip.id,
      sourceStart: 0,
      sourceEnd: 4,
      animation: { start: 0, end: 4, duration: 4 },
    },
  };
  project.motionRegions = [region];
  const layer = resolveVideoCompositionFrame(project, 2).visualLayers.find(
    (value) => value.kind === 'video'
  )!;
  if (layer.kind !== 'video') throw new Error('Missing video');
  const paint = (frame = { x: 10, y: 20, width: 320, height: 180 }) =>
    drawVideoLayer(
      destination as unknown as CanvasRenderingContext2D,
      layer,
      frame,
      1,
      new Map([[clip.id, source]]),
      {}
    );
  return { paint, surfaces, allocations, source, sourceContext, destination, transform };
}

it('isolates source pixels at full alpha and publishes once under accepted alpha and filter', () => {
  const f = fixture();
  f.paint();
  expect(f.source.draw).toHaveBeenCalledWith(f.sourceContext, 10, 20, 320, 180);
  expect(f.sourceContext.globalAlpha).toBe(1);
  expect(f.sourceContext.filter).toBe('none');
  expect(f.sourceContext.setTransform).toHaveBeenNthCalledWith(1, f.transform);
  expect(drawSceneSpotlights).toHaveBeenCalledWith(f.sourceContext, f.surfaces[0], null, [
    expect.objectContaining({
      dim: 0.65,
      projection: [2, 0, 40, 0, 2, 20, 0, 0, 1],
    }),
  ]);
  expect(f.destination.drawImage).toHaveBeenCalledExactlyOnceWith(f.surfaces[0], 0, 0);
  expect(f.destination.globalAlpha).toBe(0.37);
  expect(f.destination.filter).toBe('blur(2px)');
  expect(f.destination.save).toHaveBeenCalledTimes(f.destination.restore.mock.calls.length);
  expect(f.surfaces).toEqual([{ width: 0, height: 0, getContext: expect.any(Function) }]);
});

it.each(['allocate', 'source', 'mask', 'publish'] as const)(
  'releases the isolated window after %s failure',
  (failure) => {
    const f = fixture(failure);
    expect(f.paint).toThrow(
      failure === 'allocate' ? 'Spotlight compositor is unavailable.' : `${failure} failed`
    );
    expect(f.surfaces.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
    if (failure !== 'publish') expect(f.destination.drawImage).not.toHaveBeenCalled();
  }
);

it('bounds source isolation by the destination even for a large offscreen window', () => {
  const f = fixture();
  f.paint({ x: -100000, y: -100000, width: 200000, height: 200000 });
  expect(f.allocations).toEqual([{ width: 640, height: 360 }]);
});
