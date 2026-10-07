import { expect, it, vi } from 'vitest';
import { drawReviewSceneOverlays } from './render-scene-overlays';
import { drawReviewSpotlights } from './render-spotlight';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSpatialWindow,
} from '../../features/video/review/advanced/scene';
import {
  quickEditSpatialTargetCamera,
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
} from '../../features/video/review/advanced/spatial';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import type { ReviewSpatialRenderer } from './spatial-renderer';
vi.mock('./render-spotlight', () => ({ drawReviewSpotlights: vi.fn() }));
vi.mock('./render-click-animation', () => ({ drawReviewClicks: vi.fn() }));
vi.mock('./render-border', () => ({ drawReviewBorders: vi.fn() }));
vi.mock('./scene-frame', () => ({ drawReviewSceneComments: vi.fn() }));

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
