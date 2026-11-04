import { expect, it, vi } from 'vitest';
import {
  createReviewGpuPrimitives,
  reviewGpuContentLayers,
  reviewGpuFinishLayers,
} from './gpu-preview-layers';
import { reviewPresentedGeometry, reviewGpuSourcePlane } from './gpu-preview-geometry';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import type {
  GpuPreviewGroup,
  GpuPreviewLayer,
} from '../../features/video/composition/canvas/gpu-preview';
import type { PreviewScene } from './preview-scene';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
const size = { width: 640, height: 360 };
const dimensions = { canonical: size, backing: { width: 320, height: 180 } };
const scene: PreviewScene = {
  source: size,
  background: { enabled: false },
  zoomRegions: [],
  comments: [],
  keys: [],
  clicks: [],
};
function fixture() {
  const release = vi.fn();
  const drawImage = vi.fn();
  const context = () => ({
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    drawImage,
    globalAlpha: 1,
    fillStyle: '#000000',
  });
  const resources = {
    canvas: vi.fn((_role: string, target: typeof size) => ({
      canvas: { ...target },
      context: context(),
      release,
    })),
    bytes: vi.fn(() => ({ release })),
  } as unknown as RenderResources;
  const primitives = createReviewGpuPrimitives(resources);
  const main: GpuPreviewGroup = {
    kind: 'group',
    output: dimensions.backing,
    logical: size,
    layers: [],
  };
  const caption: GpuPreviewLayer = {
    source: { width: 320, height: 180 } as HTMLCanvasElement,
    rect: { x: 0, y: 0, ...size },
    inverse: identity,
  };
  return { primitives, main, caption, resources, release, drawImage };
}
function visit(layers: readonly GpuPreviewLayer[], result: GpuPreviewLayer[] = []) {
  for (const layer of layers) {
    result.push(layer);
    if ('kind' in layer.source && layer.source.kind === 'group') visit(layer.source.layers, result);
  }
  return result;
}

it('composes split screen and borrowed camera pixels with a silhouette mask on the GPU', () => {
  const f = fixture();
  const webcam = createQuickEditWebcam('camera', size, size);
  webcam.split = 'left';
  webcam.mirrored = true;
  const frame = { close: vi.fn() } as unknown as VideoFrame;
  const layers = reviewGpuFinishLayers({
    scene: { ...scene, webcam },
    dimensions,
    main: f.main,
    camera: { source: size, placement: webcam.placement, drawable: { videoFrame: () => frame } },
    sourceTime: 2,
    resultTime: 2,
    primitives: f.primitives,
    caption: f.caption,
    watermark: null,
  });
  const flattened = visit(layers);
  const video = flattened.find((layer) => layer.source === frame)!;
  expect(video).toBeDefined();
  expect(video.inverse[0]).toBe(-1);
  expect(flattened.some((layer) => layer.blend === 'mask')).toBe(true);
  expect(f.drawImage).not.toHaveBeenCalled();
  expect(frame.close).not.toHaveBeenCalled();
  f.primitives.dispose();
  expect(f.release).toHaveBeenCalled();
});

it('keeps watermark before captions and both final fades after captions', () => {
  const f = fixture();
  const draw = vi.fn();
  const layers = reviewGpuFinishLayers({
    scene,
    dimensions,
    main: f.main,
    sourceTime: 2,
    resultTime: 2,
    primitives: f.primitives,
    caption: f.caption,
    watermark: { draw, dispose: vi.fn(), bounds: { x: 0, y: 0, width: 1, height: 1 } },
    blackout: { opacity: 0.5, color: '#000000' },
  });
  expect(draw).toHaveBeenCalledOnce();
  expect(layers.indexOf(f.caption)).toBe(layers.length - 2);
  f.primitives.dispose();
});

it('admits annotation payloads before rasterization and releases completed bitmap batches', async () => {
  const f = fixture();
  const order: string[] = [];
  const batchRelease = vi.fn();
  const annotations = {
    describe: vi.fn(() => [{ plan: { renderDimensions: { width: 100, height: 80 } } }]),
    render: vi.fn(async () => {
      order.push('render');
      return { entries: [], release: batchRelease, retain: () => ({ release() {} }) };
    }),
  } as unknown as Parameters<typeof reviewGpuContentLayers>[0]['annotations'];
  const geometry = reviewPresentedGeometry(scene, dimensions, 2);
  await reviewGpuContentLayers({
    scene,
    dimensions,
    base: geometry.layout,
    geometry,
    sourceTime: 2,
    fps: 30,
    original: f.main,
    primitives: f.primitives,
    annotations,
    admit: (sizes) => {
      order.push('admit');
      expect(sizes).toEqual([{ width: 100, height: 80 }]);
    },
    signal: new AbortController().signal,
  });
  expect(order).toEqual(['admit', 'render']);
  expect(batchRelease).toHaveBeenCalledOnce();
  f.primitives.dispose();
});

it('clips source-cropped content to the visible video while preserving its annotation layer', async () => {
  const f = fixture();
  const geometry = reviewPresentedGeometry(scene, dimensions, 2);
  const visible = { x: 100, y: 50, width: 400, height: 240 };
  const base = {
    ...geometry.layout,
    sourceCrop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    visibleVideoRect: visible,
  };
  const entry = {
    instance: {
      id: 'annotation',
      attachment: 'content',
      transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, rotation: 0 },
    },
    bitmap: { width: 100, height: 80 },
    bitmapBounds: { x: 0, y: 0, width: 1, height: 1 },
  };
  const annotations = {
    describe: () => [],
    render: async () => ({ retain: () => ({ release() {} }), entries: [entry], release() {} }),
  } as unknown as Parameters<typeof reviewGpuContentLayers>[0]['annotations'];
  const result = await reviewGpuContentLayers({
    scene,
    dimensions,
    base,
    geometry,
    sourceTime: 2,
    fps: 30,
    original: f.main,
    primitives: f.primitives,
    annotations,
    admit() {},
    signal: new AbortController().signal,
  });
  expect(result.contentLayers).toHaveLength(1);
  const allocation = vi
    .mocked(f.resources.canvas)
    .mock.results.find((value) => value.type === 'return');
  const context = allocation!.value.context;
  expect(context.rect).toHaveBeenCalledWith(visible.x, visible.y, visible.width, visible.height);
  expect(f.drawImage).not.toHaveBeenCalled();
  f.primitives.dispose();
});

it('keeps a source-attached annotation inside the fixed window after inner zoom', async () => {
  const f = fixture();
  const camera = {
    scale: 2,
    centerX: 0.6,
    centerY: 0.4,
    spatial: {
      rotation: [0, 0, 0, 1] as const,
      perspective: 0.5,
      windowMotion: 0,
      lockBackground: true,
      focus: [],
    },
  };
  const geometry = reviewPresentedGeometry(scene, dimensions, 2, camera);
  const plane = reviewGpuSourcePlane(geometry.layout, scene.background);
  const sourceClip = { rect: plane.sourceClip, radius: 0 };
  const annotations = {
    describe: () => [],
    render: async () => ({
      retain: () => ({ release() {} }),
      entries: [
        {
          instance: {
            id: 'annotation',
            attachment: 'content',
            transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, rotation: 0 },
          },
          bitmap: { width: 100, height: 80 },
          bitmapBounds: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
      release() {},
    }),
  } as unknown as Parameters<typeof reviewGpuContentLayers>[0]['annotations'];
  const result = await reviewGpuContentLayers({
    scene,
    dimensions,
    base: geometry.layout,
    geometry,
    sourceTime: 2,
    fps: 30,
    original: f.main,
    primitives: f.primitives,
    annotations,
    admit() {},
    signal: new AbortController().signal,
    sourceClip,
  });
  expect(result.contentLayers).toHaveLength(1);
  expect(result.contentLayers[0]!.clip).toEqual(sourceClip);
  expect(result.contentLayers[0]!.inverse).toEqual(geometry.inverse);
  expect(sourceClip.rect.width).toBe(size.width / 2);
  f.primitives.dispose();
});

it.each(['circle', 'rounded'] as const)(
  'keeps %s click lenses between adjacent click batches and viewport annotations',
  async (shape) => {
    const f = fixture();
    const cue = (effect: 'press' | 'magnify') => ({
      point: { x: 0.5, y: 0.5 },
      anchor: 1.8,
      start: 1.8,
      end: 2.4,
      settings: {
        ...REVIEW_CLICK_DEFAULT,
        effect,
        magnification: 2,
        lensShape: shape,
        lensOptics: 'optical' as const,
        lensEdgeWidth: 12,
        lensShadow: 20,
      },
    });
    const current = { ...scene, clicks: [cue('press'), cue('magnify'), cue('press')] };
    const geometry = reviewPresentedGeometry(current, dimensions, 2);
    const release = vi.fn();
    const annotations = {
      describe: () => [],
      render: async () => ({
        retain: () => ({ release() {} }),
        entries: [
          {
            instance: {
              id: 'viewport',
              attachment: 'viewport',
              transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, rotation: 0 },
            },
            bitmap: { width: 100, height: 80 },
            bitmapBounds: { x: 0, y: 0, width: 1, height: 1 },
          },
        ],
        release,
      }),
    } as unknown as Parameters<typeof reviewGpuContentLayers>[0]['annotations'];
    const sourceClip = { rect: { x: 50, y: 40, width: 500, height: 280 }, radius: 8 };
    const result = await reviewGpuContentLayers({
      scene: current,
      dimensions,
      base: geometry.layout,
      geometry,
      sourceTime: 2,
      fps: 30,
      original: f.main,
      primitives: f.primitives,
      annotations,
      admit() {},
      signal: new AbortController().signal,
      sourceClip,
    });
    expect(result.contentLayers).toHaveLength(4);
    expect(result.contentLayers.every((layer) => layer.clip === sourceClip)).toBe(true);
    expect(result.viewportLayers).toHaveLength(1);
    expect(result.viewportLayers[0]!.clip).toBeUndefined();
    const lens = visit(result.contentLayers).find((layer) => layer.lens)!;
    expect(lens.source).toBe(f.main);
    expect(lens.lens).toMatchObject({ optics: 'optical', edgeWidth: 12 });
    expect(lens.lens!.scale).toBeGreaterThan(1);
    expect(lens.clip?.shape).toBe(shape === 'circle' ? 'ellipse' : undefined);
    expect(vi.mocked(f.resources.canvas).mock.calls.map(([role]) => role)).toEqual([
      'preview-gpu-click',
      'preview-gpu-click-shadow',
      'preview-gpu-click-mask',
      'preview-gpu-click-ring',
      'preview-gpu-click',
    ]);
    for (const role of ['preview-gpu-click-shadow', 'preview-gpu-click-ring']) {
      const allocation = vi.mocked(f.resources.canvas).mock.calls.find(([name]) => name === role)!;
      expect(allocation[1].width * allocation[1].height).toBeLessThan(
        (size.width * size.height) / 4
      );
      const index = vi.mocked(f.resources.canvas).mock.calls.indexOf(allocation);
      const source = vi.mocked(f.resources.canvas).mock.results[index]!.value.canvas;
      const layer = visit(result.contentLayers).find((item) => item.source === source)!;
      expect(layer.rect.width).toBe(source.width);
      expect(layer.rect.height).toBe(source.height);
      expect(layer.rect.x).toBeGreaterThan(0);
      expect(layer.rect.y).toBeGreaterThan(0);
    }
    expect(release).toHaveBeenCalledOnce();
    f.primitives.dispose();
    expect(f.release).toHaveBeenCalledTimes(5);
  }
);

it('releases annotation payloads when its GPU borrower cannot be retained', async () => {
  const f = fixture();
  const release = vi.fn();
  const annotations = {
    describe: () => [],
    render: async () => ({
      retain: () => ({ release() {} }),
      entries: [
        {
          instance: {
            id: 'viewport',
            attachment: 'viewport',
            transform: { x: 0.2, y: 0.2, width: 0.3, height: 0.3, rotation: 0 },
          },
          bitmap: { width: 100, height: 80 },
          bitmapBounds: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
      release,
    }),
  } as unknown as Parameters<typeof reviewGpuContentLayers>[0]['annotations'];
  const geometry = reviewPresentedGeometry(scene, dimensions, 2);
  await expect(
    reviewGpuContentLayers({
      scene,
      dimensions,
      base: geometry.layout,
      geometry,
      sourceTime: 2,
      fps: 30,
      original: f.main,
      primitives: f.primitives,
      annotations,
      retainAnnotationBatch() {
        throw new Error('Retain failed');
      },
      admit() {},
      signal: new AbortController().signal,
    })
  ).rejects.toThrow('Retain failed');
  expect(release).toHaveBeenCalledOnce();
  f.primitives.dispose();
  expect(f.release).not.toHaveBeenCalled();
});
it('borrows raw processed annotation bitmaps directly without a Canvas image copy', async () => {
  const f = fixture();
  const close = vi.fn();
  const release = vi.fn();
  const borrowed = vi.fn();
  const bitmap = { width: 100, height: 80, close };
  const annotations = {
    describe: () => [],
    render: async () => ({
      entries: [
        {
          instance: {
            attachment: 'content',
            transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.2, rotation: 0.3 },
          },
          bitmap,
          bitmapBounds: { x: -0.2, y: 0, width: 1.4, height: 1 },
        },
      ],
      release,
      retain: () => ({ release: borrowed }),
    }),
  } as unknown as Parameters<typeof reviewGpuContentLayers>[0]['annotations'];
  const geometry = reviewPresentedGeometry(scene, dimensions, 2);
  const result = await reviewGpuContentLayers({
    scene,
    dimensions,
    base: geometry.layout,
    geometry,
    sourceTime: 2,
    fps: 30,
    original: f.main,
    primitives: f.primitives,
    annotations,
    admit() {},
    signal: new AbortController().signal,
  });
  expect(visit(result.contentLayers).some((layer) => layer.source === bitmap)).toBe(true);
  expect(f.drawImage).not.toHaveBeenCalled();
  expect(borrowed).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
  f.primitives.dispose();
  expect(borrowed).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
});
it('preserves annotation and comment order with shared per-draw coverage and fresh frame revisions', async () => {
  const { createCanvasComment } = await import('../../features/video/review/comments');
  const f = fixture();
  const bitmaps = Array.from({ length: 3 }, () => ({ width: 100, height: 80 }));
  const annotations = {
    describe: () => [],
    render: async () => ({
      retain: () => ({ release() {} }),
      release() {},
      entries: bitmaps.map((bitmap, index) => ({
        instance: {
          attachment: index === 2 ? 'viewport' : 'content',
          transform: { x: 0.2, y: 0.3, width: 0.3, height: 0.2, rotation: 0.3 },
        },
        bitmap,
        bitmapBounds: { x: 0, y: 0, width: 1, height: 1 },
      })),
    }),
  } as unknown as Parameters<typeof reviewGpuContentLayers>[0]['annotations'];
  const current: PreviewScene = {
    ...scene,
    comments: [
      { ...createCanvasComment({ id: 'content' }), resolvedText: '' },
      { ...createCanvasComment({ id: 'viewport' }), attachment: 'viewport', resolvedText: '' },
    ],
  };
  const geometry = reviewPresentedGeometry(current, dimensions, 2);
  const args = {
    scene: current,
    dimensions,
    base: geometry.layout,
    geometry,
    sourceTime: 2,
    fps: 30,
    original: f.main,
    primitives: f.primitives,
    annotations,
    admit() {},
    signal: new AbortController().signal,
  };
  const first = await reviewGpuContentLayers(args);
  const content = first.contentLayers[0]!.source;
  if (!('kind' in content) || content.kind !== 'group') throw new Error('Missing annotation group');
  expect(content.output).toEqual(dimensions.canonical);
  expect(content.layers.map((layer) => layer.source)).toEqual(bitmaps.slice(0, 2));
  expect(content.layers[0]!.operationClip).toBe(content.layers[1]!.operationClip);
  const contentCanvas = vi
    .mocked(f.resources.canvas)
    .mock.calls.findIndex(([role]) => role === 'preview-gpu-content');
  const viewportCanvas = vi
    .mocked(f.resources.canvas)
    .mock.calls.findIndex(([role]) => role === 'preview-gpu-viewport');
  expect(first.contentLayers[1]!.source).toBe(
    vi.mocked(f.resources.canvas).mock.results[contentCanvas]!.value.canvas
  );
  expect(first.viewportLayers[0]!.source).toBe(
    vi.mocked(f.resources.canvas).mock.results[viewportCanvas]!.value.canvas
  );
  expect(first.viewportLayers[1]!.source).toBe(bitmaps[2]);
  expect(f.drawImage).not.toHaveBeenCalled();
  const second = await reviewGpuContentLayers(args);
  const later = second.contentLayers[0]!.source;
  if (!('kind' in later) || later.kind !== 'group') throw new Error('Missing annotation group');
  expect(later.layers[0]!.operationClip!.cache!.revision).not.toBe(
    content.layers[0]!.operationClip!.cache!.revision
  );
  f.primitives.dispose();
});

import { projectQuickEditPoint } from '../../features/video/composition/motion/spatial-geometry';

function expectUniformFillSupport(layer: GpuPreviewLayer) {
  if (
    !('width' in layer.source) ||
    !('height' in layer.source) ||
    typeof layer.source.width !== 'number' ||
    typeof layer.source.height !== 'number'
  )
    throw new Error('Expected raster fill.');
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 20; x++) {
      const point = projectQuickEditPoint(layer.inverse, {
        x: ((x + 0.5) * size.width) / 20,
        y: ((y + 0.5) * size.height) / 12,
      });
      if (!point) throw new Error('Viewport fill sampling is unavailable.');
      const sourceX = ((point.x - layer.rect.x) / layer.rect.width) * layer.source.width;
      const sourceY = ((point.y - layer.rect.y) / layer.rect.height) * layer.source.height;
      // A uniform field must sample inside texel centres, where transparent-edge AA is exactly one.
      expect(sourceX).toBeGreaterThanOrEqual(0.5);
      expect(sourceX).toBeLessThanOrEqual(layer.source.width - 0.5);
      expect(sourceY).toBeGreaterThanOrEqual(0.5);
      expect(sourceY).toBeLessThanOrEqual(layer.source.height - 0.5);
    }
}

it.each([1, 0.5])(
  'keeps every viewport sample fully supported for a uniform fade opacity%s',
  (opacity) => {
    const f = fixture();
    const layers = reviewGpuFinishLayers({
      scene,
      dimensions,
      main: f.main,
      sourceTime: 0,
      resultTime: 0,
      primitives: f.primitives,
      caption: f.caption,
      watermark: null,
      blackout: { opacity, color: '#000000' },
    });
    expect(layers.at(-2)).toBe(f.caption);
    expectUniformFillSupport(layers.at(-1)!);
    expect(layers.at(-1)!.source).toMatchObject({ width: 2, height: 2 });
    f.primitives.dispose();
  }
);

it('keeps split-screen background uniform while zero fade adds no layer or geometry change', () => {
  const f = fixture();
  const webcam = createQuickEditWebcam('camera', size, size);
  webcam.split = 'left';
  const camera = {
    source: size,
    placement: webcam.placement,
    drawable: { videoFrame: () => ({}) as VideoFrame },
  };
  const layers = reviewGpuFinishLayers({
    scene: { ...scene, webcam },
    dimensions,
    main: f.main,
    camera,
    sourceTime: 0,
    resultTime: 0,
    primitives: f.primitives,
    caption: f.caption,
    watermark: null,
    blackout: { opacity: 0, color: '#000000' },
  });
  expectUniformFillSupport(layers[0]!);
  expect(layers.at(-1)).toBe(f.caption);
  expect(layers.some((layer) => layer.source === f.main)).toBe(true);
  f.primitives.dispose();
});
