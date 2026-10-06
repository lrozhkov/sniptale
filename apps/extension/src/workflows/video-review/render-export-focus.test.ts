import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import { createQuickEditBorder } from '../../features/video/review/advanced/border';
import { createQuickEditSpotlight } from '../../features/video/review/advanced/focus';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneSize,
} from '../../features/video/review/advanced/scene';
import { renderRenderWindowFrames } from './render-export';
import { drawReviewSpotlights } from './render-spotlight';
import { drawReviewBorders } from './render-border';

vi.mock('./render-spotlight', () => ({ drawReviewSpotlights: vi.fn() }));
vi.mock('./render-border', () => ({ drawReviewBorders: vi.fn() }));
vi.mock('mediabunny', async (importOriginal) => ({
  ...(await importOriginal<typeof import('mediabunny')>()),
  VideoSample: class {
    draw = vi.fn();
    close = vi.fn();
  },
}));
function contextFixture() {
  return {
    translate: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}
beforeEach(() =>
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => contextFixture() }),
  })
);
afterEach(() => vi.unstubAllGlobals());

it.each(['fixed', 'follow-video'] as const)(
  'exports focus areas inside the header with %s background',
  async (zoomBehavior) => {
    const background = {
      enabled: true as const,
      type: 'solid' as const,
      color: '#222222',
      layout: { padding: 8, cornerRadius: 4 },
      zoomBehavior,
    };
    const sourceSize = { width: 320, height: 180 };
    const windowHeader = { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: 'Header' };
    const canvas = computeQuickEditSceneSize({ source: sourceSize, background, windowHeader });
    const area = { x: 0.2, y: 0, width: 0.5, height: 0.05 };
    const region = {
      ...createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 2 }),
      enter: { type: 'none' as const, duration: 0 },
      exit: { type: 'none' as const, duration: 0 },
    };
    for (const scale of [1, 2]) {
      vi.mocked(drawReviewSpotlights).mockClear();
      vi.mocked(drawReviewBorders).mockClear();
      const camera = { scale, centerX: 0.25, centerY: 0.25 };
      const layout = computeQuickEditSceneLayout({
        source: sourceSize,
        output: canvas,
        background,
        windowHeader,
        camera,
      });
      await renderRenderWindowFrames({
        window: {
          segment: {
            sourceStart: 0,
            sourceEnd: 1,
            resultStart: 0,
            resultEnd: 1,
            kind: 'keep',
            rate: 1,
          },
          timestamps: [0],
          sourceTimes: [0],
        },
        fps: 2,
        fragmentOffset: 0,
        zoomRegions: [
          { ...region, id: 'camera', transform: camera },
          { ...region, spotlight: { ...createQuickEditSpotlight(), area } },
          { ...region, id: 'border', border: { ...createQuickEditBorder(), area } },
        ],
        background,
        windowHeader,
        comments: [],
        canvas: Object.assign(document.createElement('canvas'), canvas),
        sourceSize,
        context: contextFixture(),
        image: null,
        frameSink: {
          samplesAtTimestamps: async function* () {
            yield new VideoSample(document.createElement('canvas'), { timestamp: 0 });
          },
        },
        videoOut: { add: vi.fn(async () => undefined), close: vi.fn() },
        resultDuration: 1,
        onProgress: undefined,
        signal: new AbortController().signal,
      });
      const opening = vi.mocked(drawReviewSpotlights).mock.calls[0]![3][0]!.opening;
      expect(opening.y).toBeCloseTo(layout.videoTransform.y - canvas.headerHeight * scale);
      expect(opening.height).toBeCloseTo(layout.windowRect.height * scale * area.height);
      expect(opening.y + opening.height).toBeLessThan(layout.videoTransform.y);
      const border = vi.mocked(drawReviewBorders).mock.calls[0]![2][0]!;
      expect(border.width).toBe(3 * scale);
      const start = border.path.match(/^M([\d.-]+) ([\d.-]+)/)!;
      expect(Number(start[1])).toBeCloseTo(opening.x + opening.width / 2);
      expect(Number(start[2])).toBeCloseTo(opening.y + border.width / 2);
    }
  }
);
