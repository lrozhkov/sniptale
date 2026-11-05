// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../project/factories/creation';
import { createVideoProjectMotionRegion } from '../../project/motion';
import { createQuickEditSpotlight } from '../../project/scene/focus-appearance';
import { resolveVideoCompositionFrame } from '../timeline/frame';
import { drawSceneSpotlights } from './spotlight';
import { drawVideoLayer } from './video';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { windowHeaderImageKey } from './window-header';
import { drawFittedMediaLayer } from './fitted-media';
import type { PreparedSourceSampling, VideoCompositionFrameSource } from './media-source';

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
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    transform: vi.fn(),
    drawImage: vi.fn((..._args: unknown[]) => {
      if (failure === 'publish') throw new Error('publish failed');
    }),
  };
  let source: VideoCompositionFrameSource = {
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
  const images: Record<string, HTMLImageElement> = {};
  const paint = (frame = { x: 10, y: 20, width: 320, height: 180 }) =>
    drawVideoLayer(
      destination as unknown as CanvasRenderingContext2D,
      layer,
      frame,
      1,
      new Map([[clip.id, source]]),
      images
    );
  return {
    paint,
    surfaces,
    allocations,
    source,
    sourceContext,
    destination,
    transform,
    layer,
    images,
    prepare(sampling: PreparedSourceSampling) {
      source = { ...source, preparedSampling: sampling };
    },
  };
}

it.each([false, true])(
  'keeps prepared crop in inner camera coordinates and restores fixed-window state after tile failure: %s',
  (failTile) => {
    const f = fixture();
    f.layer.spotlights = [];
    f.layer.clip.windowHeader = DEFAULT_WINDOW_HEADER;
    f.layer.clip.sourceCrop = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 };
    f.layer.clip.windowCornerRadius = 12;
    f.layer.sourceContentTransform = [1.25, 0, -8, 0, 1.25, -4, 0, 0, 1];
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalWidth: { value: 320 },
      naturalHeight: { value: 18 },
      complete: { value: true },
    });
    f.images[windowHeaderImageKey(f.layer.clipId, DEFAULT_WINDOW_HEADER)] = image;
    const tile = document.createElement('canvas');
    const visitPreparedTiles = vi.fn<PreparedSourceSampling['visitPreparedTiles']>(
      (_demand, consume) => {
        if (failTile) throw new Error('prepared tile failed');
        consume({
          image: tile,
          originalPixelROI: { x: 32, y: 18, width: 80, height: 45 },
          physicalSourceRect: { x: 2, y: 3, width: 24, height: 12 },
        });
        return true;
      }
    );
    f.prepare({
      sourceKey: {},
      sourceTime: 2,
      passTime: 2,
      sourceSize: { width: 320, height: 180 },
      drawPrepared: vi.fn(() => false),
      visitPreparedTiles,
    });
    if (failTile) expect(f.paint).toThrow('prepared tile failed');
    else f.paint();
    expect(drawFittedMediaLayer).toHaveBeenCalledWith(
      expect.objectContaining({ windowHeaderImage: image })
    );
    expect(f.destination.roundRect).toHaveBeenCalledExactlyOnceWith(10, 20, 320, 180, 12);
    expect(f.destination.transform).toHaveBeenCalledExactlyOnceWith(1.25, 0, 0, 1.25, -8, -4);
    expect(f.destination.rect).toHaveBeenNthCalledWith(1, 10, 38, 320, 162);
    const firstClip = f.destination.clip.mock.invocationCallOrder[0]!;
    const inner = f.destination.transform.mock.invocationCallOrder[0]!;
    const bodyClip = f.destination.clip.mock.invocationCallOrder[1]!;
    expect(firstClip).toBeLessThan(inner);
    expect(inner).toBeLessThan(bodyClip);
    expect(bodyClip).toBeLessThan(visitPreparedTiles.mock.invocationCallOrder[0]!);
    expect(visitPreparedTiles).toHaveBeenCalledWith('body', expect.any(Function));
    expect(f.source.draw).not.toHaveBeenCalled();
    expect(f.destination.save.mock.calls.length).toBeGreaterThan(0);
    expect(f.destination.restore).toHaveBeenCalledTimes(f.destination.save.mock.calls.length);
    expect(f.destination.restore.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      visitPreparedTiles.mock.invocationCallOrder[0]!
    );
    expect(f.surfaces).toHaveLength(0);
    if (failTile) expect(f.destination.drawImage).not.toHaveBeenCalled();
    else {
      const args = f.destination.drawImage.mock.calls[0];
      expect(args?.slice(0, 5)).toEqual([tile, 2, 3, 24, 12]);
      expect(args?.[5]).toBeCloseTo(10, 12);
      expect(args?.[6]).toBeCloseTo(5.6, 12);
      expect(args?.[7]).toBeCloseTo(400 / 3, 12);
      expect(args?.[8]).toBeCloseTo(81, 12);
    }
  }
);

it('isolates source pixels at full alpha and publishes once under accepted alpha and filter', () => {
  const f = fixture();
  f.paint();
  expect(f.source.draw).toHaveBeenCalledWith(f.sourceContext, 10, 20, 320, 180);
  expect(f.sourceContext.globalAlpha).toBe(1);
  expect(f.sourceContext.filter).toBe('none');
  expect(f.sourceContext.setTransform).toHaveBeenNthCalledWith(1, f.transform);
  expect(drawSceneSpotlights).toHaveBeenCalledWith(
    f.sourceContext,
    f.surfaces[0],
    null,
    [
      expect.objectContaining({
        dim: 0.65,
        projection: [2, 0, 40, 0, 2, 20, 0, 0, 1],
      }),
    ],
    undefined
  );
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
