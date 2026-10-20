import { expect, it, vi } from 'vitest';
import { drawReviewSceneOverlays } from './render-scene-overlays';
import { drawReviewSpotlights } from './render-spotlight';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSpatialWindow,
} from '../../features/video/review/advanced/scene';
import { quickEditSpatialTargetCamera } from '../../features/video/review/advanced/spatial';
import { DEFAULT_CAMERA_PERSPECTIVE as DEFAULT_QUICK_EDIT_PERSPECTIVE } from '../../features/video/project/motion/spatial';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import type { ReviewSpatialRenderer } from '../../features/video/composition/canvas/spatial-renderer';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
vi.mock('./render-spotlight', () => ({ drawReviewSpotlights: vi.fn() }));
vi.mock('./render-click-animation', () => ({ drawReviewClicks: vi.fn() }));
vi.mock('../../features/video/composition/draw/border', () => ({ drawSceneBorders: vi.fn() }));
vi.mock('./scene-frame', async (original) => ({
  ...(await original<typeof import('./scene-frame')>()),
  drawReviewSceneComments: vi.fn(),
}));

it.each([false, true])(
  'clips content annotations in the actual video plane and paints viewport annotations after projection=%s',
  (spatial) => {
    const events: string[] = [];
    const bitmap = { width: 20, height: 10, close: vi.fn() };
    const context = (role: string) =>
      ({
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        roundRect: vi.fn(),
        clip: vi.fn(() => events.push(`clip-${role}`)),
        translate: vi.fn(),
        rotate: vi.fn(),
        drawImage: vi.fn(() => events.push(`annotation-${role}`)),
      }) as unknown as CanvasRenderingContext2D;
    const main = context('main'),
      overlay = context('overlay');
    const canvas = { width: 800, height: 450 } as HTMLCanvasElement;
    const background = { enabled: false as const };
    const region = {
      ...createQuickEditZoomRegion({ id: 'annotation-zoom', at: 0 }),
      transform: { scale: 2, centerX: 0.4, centerY: 0.5 },
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: spatial, rotateY: 30 },
    };
    const layout = computeQuickEditSceneLayout({
      output: canvas,
      source: canvas,
      background,
      camera: quickEditSpatialTargetCamera(region),
    });
    const instance: ReviewAnnotationEffect = {
      id: 'content',
      snapshotId: 'effect:test',
      start: 0,
      end: 1,
      enabled: true,
      attachment: 'content',
      order: 0,
      controls: {},
      transform: { x: 0.2, y: 0.3, width: 0.4, height: 0.1, rotation: 0.2 },
    };
    const renderer: ReviewSpatialRenderer = {
      validateSizes: vi.fn(),
      surface: vi.fn(() => ({ canvas, context: overlay })),
      draw: vi.fn(() => events.push('projection')),
      dispose: vi.fn(),
    };
    drawReviewSceneOverlays({
      scene: { canvas, layout, background, image: null, sample: { draw: vi.fn() } },
      renderer,
      context: main,
      canvas,
      spotlightScratch: null,
      regions: [region],
      globalResultTime: 0.5,
      cameraScale: 2,
      sourceWidth: 800,
      annotationFrames: [
        { instance, bitmap, bitmapBounds: { x: -0.1, y: 0, width: 1.1, height: 1 } },
        {
          instance: { ...instance, id: 'viewport', attachment: 'viewport', order: 1 },
          bitmap,
          bitmapBounds: { x: 0, y: 0, width: 1, height: 1 },
        },
      ],
    });
    expect(events).toEqual(
      spatial
        ? ['clip-overlay', 'annotation-overlay', 'projection', 'annotation-main']
        : ['clip-main', 'annotation-main', 'annotation-main']
    );
    const contentContext = spatial ? overlay : main;
    expect(contentContext.clip).toHaveBeenCalledOnce();
    expect(main.translate).toHaveBeenLastCalledWith((0.2 + 0.4 / 2) * 800, (0.3 + 0.1 / 2) * 450);
    expect(main.rotate).toHaveBeenLastCalledWith(0.2);
    expect(contentContext.drawImage).toHaveBeenCalledWith(
      bitmap,
      spatial ? -192 : -384,
      spatial ? -22.5 : -45,
      spatial ? 352 : 704,
      spatial ? 45 : 90
    );
    expect(renderer.draw).toHaveBeenCalledTimes(spatial ? 1 : 0);
  }
);

it.each([false, true])(
  'clips spotlight corners to the same decorated window with perspective=%s',
  (spatial) => {
    const canvas = { width: 800, height: 450 } as HTMLCanvasElement;
    const context = {} as CanvasRenderingContext2D;
    const background = {
      enabled: true as const,
      type: 'solid' as const,
      color: '#333333',
      zoomBehavior: 'fixed' as const,
      layout: { padding: 30, cornerRadius: 24 },
    };
    const region = {
      ...createQuickEditZoomRegion({ id: 'z', at: 0 }),
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: spatial, rotateY: 35 },
    };
    const layout = computeQuickEditSceneLayout({
      output: canvas,
      source: canvas,
      background,
      camera: quickEditSpatialTargetCamera(region),
    });
    const renderer: ReviewSpatialRenderer = {
      validateSizes: vi.fn(),
      surface: () => ({ canvas, context }),
      draw: vi.fn(),
      dispose: vi.fn(),
    };
    drawReviewSceneOverlays({
      canvas,
      context,
      renderer,
      spotlightScratch: null,
      regions: [region],
      globalResultTime: 1,
      cameraScale: region.transform.scale,
      sourceWidth: canvas.width,
      scene: { canvas, layout, background, image: null, sample: { draw: vi.fn() } },
    });
    const clip = vi.mocked(drawReviewSpotlights).mock.calls.at(-1)![4]!;
    const window = computeQuickEditSpatialWindow(layout, background);
    expect(clip.rect).toEqual(window);
    expect(clip.radius).toBeCloseTo((24 * window.width) / layout.windowRect.width);
    if (spatial) expect(clip.radius).toBeGreaterThan(24);
  }
);

it('forwards managed resources and uses canonical spatial content before viewport comments', async () => {
  const { drawSceneBorders } = await import('../../features/video/composition/draw/border');
  const { drawReviewSceneComments } = await import('./scene-frame');
  const { createCanvasComment } = await import('../../features/video/review/comments');
  const canonical = { width: 1200, height: 800 };
  const canvas = { width: 300, height: 200 } as HTMLCanvasElement;
  const background = { enabled: false as const };
  const region = {
    ...createQuickEditZoomRegion({ id: 'canonical-spatial', at: 0 }),
    perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: 35 },
  };
  const camera = quickEditSpatialTargetCamera(region);
  const layout = computeQuickEditSceneLayout({
    output: canvas,
    source: canonical,
    background,
    camera,
  });
  const canonicalLayout = computeQuickEditSceneLayout({
    output: canonical,
    source: canonical,
    background,
    camera,
  });
  const context = {} as CanvasRenderingContext2D;
  const overlayContext = {} as CanvasRenderingContext2D;
  const resources = { canvas: vi.fn(), bytes: vi.fn() };
  const renderer = {
    validateSizes: vi.fn(),
    surface: () => ({ canvas, context: overlayContext }),
    draw: vi.fn(),
    dispose: vi.fn(),
  };
  const comment = { ...createCanvasComment({ id: 'comment', at: 0 }), resolvedText: 'Same layout' };
  const comments = [
    { ...comment, attachment: 'content' as const },
    { ...comment, id: 'viewport', attachment: 'viewport' as const },
  ];
  vi.mocked(drawReviewSceneComments).mockClear();
  drawReviewSceneOverlays({
    canvas,
    context,
    renderer,
    spotlightScratch: null,
    regions: [region],
    globalResultTime: 1,
    cameraScale: 1,
    sourceWidth: 1200,
    scene: {
      canvas,
      layout,
      background,
      comments,
      image: null,
      sample: { draw: vi.fn() },
      resources,
      commentSpace: { canvas: canonical, layout: canonicalLayout, background },
    },
  });
  expect(vi.mocked(drawReviewSpotlights).mock.calls.at(-1)![6]).toBe(resources);
  expect(vi.mocked(drawSceneBorders).mock.calls.at(-1)![4]).toBe(resources);
  const [content, viewport] = vi.mocked(drawReviewSceneComments).mock.calls;
  expect(content![0]).toBe(overlayContext);
  expect(content![1].commentSpace?.canvas).toEqual(canonical);
  expect(content![1].commentSpace?.layout.spatial).toBeUndefined();
  expect(content![1].comments).toEqual([comments[0]]);
  expect(viewport![0]).toBe(context);
  expect(viewport![1].commentSpace?.layout).toBe(canonicalLayout);
  expect(viewport![1].comments).toEqual([comments[1]]);
  const calls = vi.mocked(drawReviewSceneComments).mock.invocationCallOrder;
  expect(calls[0]).toBeLessThan(renderer.draw.mock.invocationCallOrder[0]!);
  expect(calls[1]).toBeGreaterThan(renderer.draw.mock.invocationCallOrder[0]!);
});

it.each(['absent', 'hidden', 'outside-time', 'not-exported'] as const)(
  'skips an empty spatial projection with %s content while preserving spotlight and viewport comments',
  async (condition) => {
    const { createCanvasComment } = await import('../../features/video/review/comments');
    const { drawReviewSceneComments } = await import('./scene-frame');
    const canvas = { width: 1280, height: 720 } as HTMLCanvasElement;
    const context = {} as CanvasRenderingContext2D;
    const background = { enabled: false as const };
    const region = {
      ...createQuickEditZoomRegion({ id: 'spatial', at: 0 }),
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: 35 },
    };
    const layout = computeQuickEditSceneLayout({
      output: canvas,
      source: canvas,
      background,
      camera: quickEditSpatialTargetCamera(region),
    });
    const viewport = {
      ...createCanvasComment({ id: 'viewport', at: 0 }),
      attachment: 'viewport' as const,
      renderToVideo: true,
      resolvedText: 'Viewport',
    };
    const content = {
      ...viewport,
      id: 'content',
      attachment: 'content' as const,
      ...(condition === 'hidden' ? { visible: false } : {}),
      ...(condition === 'outside-time' ? { start: 10 } : {}),
      ...(condition === 'not-exported' ? { renderToVideo: false } : {}),
    };
    const renderer = {
      validateSizes: vi.fn(),
      surface: vi.fn(() => ({ canvas, context })),
      draw: vi.fn(),
      dispose: vi.fn(),
    };
    vi.mocked(drawReviewSceneComments).mockClear();
    vi.mocked(drawReviewSpotlights).mockClear();
    drawReviewSceneOverlays({
      canvas,
      context,
      renderer,
      spotlightScratch: null,
      regions: [region],
      globalResultTime: 1,
      cameraScale: 1,
      sourceWidth: canvas.width,
      scene: {
        canvas,
        layout,
        background,
        image: null,
        sample: { draw: vi.fn() },
        sourceTime: 1,
        comments: condition === 'absent' ? [viewport] : [content, viewport],
      },
    });
    expect(renderer.surface).not.toHaveBeenCalled();
    expect(renderer.draw).not.toHaveBeenCalled();
    expect(drawReviewSpotlights).toHaveBeenCalledOnce();
    expect(drawReviewSceneComments).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ comments: [viewport] })
    );
  }
);
