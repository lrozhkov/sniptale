// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
  prepareReviewExportSourceSampling,
  drawReviewPreparedSource,
  reviewExportSamplingAllocation,
} from './export-source-sampling';
import { planEnhancedRegion } from '../../features/video/composition/export-enhancement/region-plan';
import type { ExportEnhancer } from '../../features/video/composition/export-enhancement/enhancer';
import { paintReviewExportScene } from './render-export-scene';
import { createQuickEditSpotlight } from '../../features/video/project/scene/focus-appearance';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { DEFAULT_CAMERA_PERSPECTIVE } from '../../features/video/project/motion/spatial';
import type { ReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
vi.mock('../../features/video/composition/draw/spotlight', () => ({
  drawSceneSpotlights: vi.fn(
    (
      context: CanvasRenderingContext2D,
      _canvas: unknown,
      _scratch: unknown,
      frames: readonly {
        opening: { x: number; y: number; width: number; height: number };
        sharpPaint?: (context: CanvasRenderingContext2D) => void;
      }[]
    ) => {
      for (const frame of frames) {
        if (!frame.sharpPaint) continue;
        context.save();
        context.beginPath();
        context.rect(frame.opening.x, frame.opening.y, frame.opening.width, frame.opening.height);
        context.clip();
        frame.sharpPaint(context);
        context.restore();
      }
    }
  ),
}));
const scene = {
  sourceSize: { width: 32, height: 18 },
  background: { enabled: false as const },
  zoomRegions: [],
  comments: [],
  image: null,
};
function enhancer() {
  const witness: unknown[] = [];
  return {
    witness,
    withEnhancedRegion: vi.fn<ExportEnhancer['withEnhancedRegion']>(async (request, consume) => {
      witness.push(request);
      const plan = planEnhancedRegion({ ...request, mode: 'bicubic-sharpen' });
      if (!plan.applied) return { applied: false, tileCount: 0 };
      for (const tile of plan.tiles) {
        const image = document.createElement('canvas');
        image.width = tile.destination.width;
        image.height = tile.destination.height;
        const c = image.getContext('2d')!;
        c.fillStyle = '#ff0000';
        c.fillRect(0, 0, image.width, image.height);
        await consume({
          image,
          sourceRect: { x: 0, y: 0, width: image.width, height: image.height },
          destination: tile.destination,
        });
        image.width = image.height = 0;
      }
      return { applied: true, tileCount: plan.tiles.length };
    }),
  };
}
it('uses original decoded pixels and clocks before composition and owns copied tiles through draw', async () => {
  const model = enhancer();
  const events: string[] = [];
  const sample = {
    timestamp: 17.233,
    draw: vi.fn((c: CanvasRenderingContext2D) => {
      events.push('original');
      c.fillStyle = '#00ff00';
      c.fillRect(0, 0, 32, 18);
    }),
  };
  const frame = await prepareReviewExportSourceSampling({
    enhancer: model,
    scene,
    output: { width: 64, height: 36 },
    sample,
    sourceTime: 17.25,
    resultTime: 3.5,
    signal: new AbortController().signal,
  });
  expect(frame).not.toBeNull();
  expect(sample.draw).toHaveBeenCalledOnce();
  expect(events).toEqual(['original']);
  expect(frame!.sampling.sourceKey).toBe(sample);
  expect(frame!.sampling.sourceTime).toBe(17.233);
  expect(frame!.sampling.passTime).toBe(3.5);
  const request = model.withEnhancedRegion.mock.calls[0]![0];
  const raw = request.source as HTMLCanvasElement;
  expect([...raw.getContext('2d')!.getImageData(0, 0, 1, 1).data]).toEqual([0, 255, 0, 255]);
  const output = document.createElement('canvas');
  output.width = 64;
  output.height = 36;
  expect(
    drawReviewPreparedSource(output.getContext('2d')!, frame!.sampling, 'body:0', {
      x: 0,
      y: 0,
      width: 64,
      height: 36,
    })
  ).toBe(true);
  expect([...output.getContext('2d')!.getImageData(3, 3, 1, 1).data]).toEqual([255, 0, 0, 255]);
  frame!.dispose();
  frame!.dispose();
  expect(raw.width).toBe(0);
  expect(() => frame!.sampling.visitPreparedTiles('body:0', vi.fn())).toThrow('disposed');
});
it('does not capture or initialize a backend when continuous geometry has no growth', async () => {
  const model = enhancer(),
    sample = { draw: vi.fn() };
  expect(
    await prepareReviewExportSourceSampling({
      enhancer: model,
      scene,
      output: scene.sourceSize,
      sample,
      sourceTime: 0,
      resultTime: 0,
      signal: new AbortController().signal,
    })
  ).toBeNull();
  expect(sample.draw).not.toHaveBeenCalled();
  expect(model.withEnhancedRegion).not.toHaveBeenCalled();
});

it('composes a dense original-source body below the unchanged joined header', async () => {
  const model = enhancer(),
    header = document.createElement('canvas');
  header.width = 32;
  header.height = 8;
  const h = header.getContext('2d')!;
  h.fillStyle = '#0000ff';
  h.fillRect(0, 0, 32, 8);
  const value = { ...scene, windowHeader: DEFAULT_WINDOW_HEADER, headerImage: header };
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const sample = {
    draw: (context: CanvasRenderingContext2D, x: number, y: number, w: number, height: number) => {
      context.fillStyle = '#00ff00';
      context.fillRect(x, y, w, height);
    },
  };
  const frame = await prepareReviewExportSourceSampling({
    enhancer: model,
    scene: value,
    output: canvas,
    sample,
    sourceTime: 0,
    resultTime: 0,
    signal: new AbortController().signal,
  });
  expect(frame).not.toBeNull();
  try {
    paintReviewExportScene({
      scene: value,
      context: canvas.getContext('2d')!,
      canvas,
      sample,
      resultTime: 0,
      sourceTime: 0,
      spatialRenderer: undefined,
      scratch: null,
      blurEnabled: false,
      exportSampling: frame!,
    });
    const layout = frame!.plan.layout,
      window = layout.windowRect,
      video = layout.videoTransform;
    expect([
      ...canvas
        .getContext('2d')!
        .getImageData(Math.floor(window.x + window.width / 2), Math.ceil(window.y + 1), 1, 1).data,
    ]).toEqual([0, 0, 255, 255]);
    expect([
      ...canvas
        .getContext('2d')!
        .getImageData(
          Math.floor(video.x + video.width / 2),
          Math.floor(video.y + video.height / 2),
          1,
          1
        ).data,
    ]).toEqual([255, 0, 0, 255]);
  } finally {
    frame!.dispose();
  }
});
it('paints a lens from its own denser original-source demand rather than magnifying the prepared body', async () => {
  const model = enhancer();
  model.withEnhancedRegion.mockImplementation(async (request, consume) => {
    const plan = planEnhancedRegion({ ...request, mode: 'bicubic-sharpen' });
    if (!plan.applied) return { applied: false, tileCount: 0 };
    for (const tile of plan.tiles) {
      const image = document.createElement('canvas');
      image.width = tile.destination.width;
      image.height = tile.destination.height;
      const c = image.getContext('2d')!;
      c.fillStyle = request.targetSize.width / request.roi.width > 2.5 ? '#0000ff' : '#ff0000';
      c.fillRect(0, 0, image.width, image.height);
      await consume({
        image,
        sourceRect: { x: 0, y: 0, width: image.width, height: image.height },
        destination: tile.destination,
      });
    }
    return { applied: true, tileCount: plan.tiles.length };
  });
  const region = createQuickEditZoomRegion({ id: 'lens', at: 0, duration: 10 });
  region.spotlight = {
    ...createQuickEditSpotlight(),
    effect: 'magnify',
    magnification: 2,
    lensOptics: 'flat',
  };
  const value = { ...scene, zoomRegions: [region] };
  const sample = {
    draw: (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
      c.fillStyle = '#00ff00';
      c.fillRect(x, y, w, h);
    },
  };
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  const frame = await prepareReviewExportSourceSampling({
    enhancer: model,
    scene: value,
    output: canvas,
    sample,
    sourceTime: 1,
    resultTime: 1,
    signal: new AbortController().signal,
  });
  expect(frame!.plan.lenses).toHaveLength(1);
  expect(model.withEnhancedRegion).toHaveBeenCalledTimes(2);
  try {
    paintReviewExportScene({
      scene: value,
      context: canvas.getContext('2d')!,
      canvas,
      sample,
      resultTime: 1,
      sourceTime: 1,
      spatialRenderer: undefined,
      scratch: null,
      blurEnabled: false,
      exportSampling: frame!,
    });
    expect([...canvas.getContext('2d')!.getImageData(32, 18, 1, 1).data]).toEqual([0, 0, 255, 255]);
    expect([...canvas.getContext('2d')!.getImageData(2, 2, 1, 1).data]).toEqual([255, 0, 0, 255]);
  } finally {
    frame!.dispose();
  }
});
it('keeps a borrowed original raster alive until cancelled inference settles and then releases it', async () => {
  const controller = new AbortController();
  let finish!: () => void;
  let source: HTMLCanvasElement | undefined;
  const model = {
    withEnhancedRegion: vi.fn<ExportEnhancer['withEnhancedRegion']>(async (request) => {
      source = request.source as HTMLCanvasElement;
      await new Promise<void>((r) => (finish = r));
      return { applied: false, tileCount: 0 };
    }),
  };
  const pending = prepareReviewExportSourceSampling({
    enhancer: model,
    scene,
    output: { width: 64, height: 36 },
    sample: { draw: vi.fn() },
    sourceTime: 0,
    resultTime: 0,
    signal: controller.signal,
  });
  await vi.waitFor(() => expect(model.withEnhancedRegion).toHaveBeenCalledOnce());
  controller.abort();
  expect(source!.width).toBe(32);
  finish();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(source!.width).toBe(0);
});
it('keeps logical 3D source rectangles separate from dense body and sharp-lens raster storage', async () => {
  const model = enhancer(),
    camera = createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 10 });
  camera.enter.duration = camera.exit.duration = 0;
  camera.transform.scale = 2;
  camera.perspective = { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateY: 25 };
  const lens = createQuickEditZoomRegion({ id: 'lens', at: 0, duration: 10 });
  lens.enter.duration = lens.exit.duration = 0;
  lens.spotlight = {
    ...createQuickEditSpotlight(),
    effect: 'magnify',
    magnification: 2,
    lensOptics: 'flat',
  };
  const value = { ...scene, zoomRegions: [camera, lens] },
    canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 36;
  const sample = {
    draw: (context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
      context.fillStyle = '#00ff00';
      context.fillRect(x, y, w, h);
    },
  };
  const prepared = await prepareReviewExportSourceSampling({
    enhancer: model,
    scene: value,
    output: canvas,
    sample,
    sourceTime: 1,
    resultTime: 1,
    signal: new AbortController().signal,
  });
  const draw = vi.fn();
  const renderer = {
    surface: (_role: string, width: number, height: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return { canvas, context: canvas.getContext('2d')! };
    },
    draw,
  } as unknown as ReviewSpatialRenderer;
  try {
    paintReviewExportScene({
      scene: value,
      context: canvas.getContext('2d')!,
      canvas,
      sample,
      resultTime: 1,
      sourceTime: 1,
      spatialRenderer: renderer,
      scratch: null,
      blurEnabled: false,
      exportSampling: prepared!,
    });
    const requests = draw.mock.calls.map(
      (call) =>
        call[1] as {
          source: HTMLCanvasElement;
          sourceRect: { width: number; height: number };
          projection?: readonly number[];
        }
    );
    expect(requests.some((r) => r.source.width > r.sourceRect.width)).toBe(true);
    expect(requests.some((r) => r.projection !== undefined)).toBe(true);
    const allocation = reviewExportSamplingAllocation(prepared!.plan, canvas, value.background);
    expect(allocation.active).toBe(true);
    for (const r of requests) {
      expect(r.source.width).toBeGreaterThan(0);
      expect(r.source.width).toBeLessThanOrEqual(
        Math.max(allocation.plane.width, allocation.overlay.width)
      );
      expect(r.source.height).toBeLessThanOrEqual(
        Math.max(allocation.plane.height, allocation.overlay.height)
      );
      expect(r.sourceRect.width).toBeGreaterThan(0);
    }
  } finally {
    prepared!.dispose();
  }
});
