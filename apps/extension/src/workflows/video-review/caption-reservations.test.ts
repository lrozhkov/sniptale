import { expect, it, vi } from 'vitest';
import { reviewCaptionReservations } from './caption-reservations';
import type { PreviewScene } from './preview-scene';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import {
  createQuickEditWebcam,
  quickEditWebcamFrameAt,
  quickEditWebcamBounds,
} from '../../features/video/review/advanced/webcam';
import { createQuickEditWatermark } from '../../features/video/project/scene/watermark';
import { createCanvasComment } from '../../features/video/review/comments';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { measureReviewComment } from './render-comments';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import { REVIEW_KEY_DEFAULT } from '../../features/video/project/action-feedback/key-animation';
import { drawReviewKeys } from './render-key-animation';

const output = { width: 640, height: 360 };
function fixture() {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  const scene: PreviewScene = {
    source: output,
    background: { enabled: false },
    zoomRegions: [],
    keys: [],
    comments: [],
    clicks: [],
    captions: {
      document: undefined,
      settings: createReviewCaptionSettings(),
      segments: buildReviewTimeMap(10, []),
    },
  };
  return { context, scene, output, watermarkBounds: { x: 280, y: 300, width: 80, height: 24 } };
}
const contains = (
  outer: { x: number; y: number; width: number; height: number },
  inner: { x: number; y: number; width: number; height: number }
) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width - 1e-8 &&
  outer.y + outer.height >= inner.y + inner.height - 1e-8;
it('reserves actual watermark paint and its rotated tiled bounds', () => {
  const args = fixture();
  args.scene.watermark = createQuickEditWatermark('Mark');
  args.scene.watermark.mode = 'text';
  expect(reviewCaptionReservations(args)).toEqual([{ ...args.watermarkBounds, start: 0, end: 10 }]);
  args.scene.watermark.layout = 'tiled';
  args.scene.watermark.tile.rotation = 45;
  const areas = reviewCaptionReservations(args);
  expect(areas.length).toBeGreaterThan(1);
  expect(
    areas.every(
      (area) => area.conservative && area.width > 0 && area.height > 0 && area.x >= 0 && area.y >= 0
    )
  ).toBe(true);
});
it('uses the key painter scale and latest-key lifetime, including equal-start replacement', () => {
  const args = fixture();
  const settings = {
    ...REVIEW_KEY_DEFAULT,
    enabled: true,
    style: { ...REVIEW_KEY_DEFAULT.style, entrance: 'none' as const },
  };
  args.scene.keys = [
    { label: 'Old', settings, start: 0, end: 5 },
    { label: 'Replaced', settings, start: 2, end: 7 },
    { label: 'New', settings, start: 2, end: 3 },
  ];
  const areas = reviewCaptionReservations(args);
  expect(areas.map((area) => [area.start, area.end]).sort((a, b) => a[0]! - b[0]!)).toEqual([
    [0, 2],
    [2, 3],
  ]);
  drawReviewKeys(args.context, args.scene.keys, 2.5, output);
  const painted = vi.mocked(args.context.roundRect).mock.calls.at(-1)!;
  const area = areas.find((entry) => entry.start === 2)!;
  for (const [index, key] of (['x', 'y', 'width', 'height'] as const).entries())
    expect(area[key]).toBeCloseTo(painted[index] as number);
});
it('projects only actual camera coverage through Cut/Speed, excluding hidden intervals and track EOF', () => {
  const args = fixture();
  args.scene.webcam = createQuickEditWebcam('camera', output, output);
  args.scene.webcam.offsetSeconds = 2;
  args.scene.webcam.hiddenRanges = [{ id: 'hide', start: 4, end: 5 }];
  args.scene.webcamDuration = 4;
  args.scene.captions!.segments = buildReviewTimeMap(10, [
    { id: 'cut', kind: 'cut', start: 3, end: 4, requestedStart: 3, requestedEnd: 4 },
    {
      id: 'speed',
      kind: 'speed',
      start: 5,
      end: 7,
      requestedStart: 5,
      requestedEnd: 7,
      rate: 2,
      audio: 'speed',
    },
  ]);
  expect(reviewCaptionReservations(args).map((area) => [area.start, area.end])).toEqual([
    [2, 3],
    [4, 4.5],
  ]);
});
it.each(['ease-in-out', 'shrink'] as const)(
  'bounds every sampled camera silhouette during %s without allocating pixels',
  (type) => {
    const args = fixture();
    const webcam = createQuickEditWebcam('camera', output, output);
    webcam.placement = { x: 0.1, y: 0.1, width: 0.2, height: 0.3 };
    webcam.positions = [
      {
        id: 'move',
        time: 2,
        placement: { x: 0.6, y: 0.5, width: 0.3, height: 0.2 },
        transition: { type, duration: 2 },
      },
    ];
    args.scene.webcam = webcam;
    args.scene.webcamDuration = 10;
    const areas = reviewCaptionReservations(args);
    for (let time = 2; time < 4; time += 0.1) {
      const placement = quickEditWebcamBounds(
        quickEditWebcamFrameAt(webcam, time, 10)!.placement,
        output,
        webcam.appearance.shape
      );
      expect(
        areas.some(
          (area) =>
            area.start <= time &&
            time < area.end &&
            contains(area, {
              x: placement.x * output.width,
              y: placement.y * output.height,
              width: placement.width * output.width,
              height: placement.height * output.height,
            })
        )
      ).toBe(true);
    }
    expect(areas.find((area) => area.start === 2)?.conservative).toBe(true);
  }
);
it('uses the existing comment geometry and ignores comments excluded from burn-in', () => {
  const args = fixture();
  const comment = {
    ...createCanvasComment({ id: 'comment', start: 2, end: 5, position: { x: 0.5, y: 0.7 } }),
    attachment: 'viewport' as const,
    renderToVideo: true,
    resolvedText: 'Comment',
  };
  args.scene.comments = [comment, { ...comment, id: 'hidden', renderToVideo: false }];
  const measured = measureReviewComment(args.context, comment, {
    canvas: output,
    videoTransform: null,
    scale: 1,
  });
  const areas = reviewCaptionReservations(args);
  expect(areas).toHaveLength(1);
  expect(areas[0]).toMatchObject({ start: 2, end: 5 });
  expect(contains(areas[0]!, measured.box!)).toBe(true);
});
it('conservatively bounds content comments across a linked camera translation and scale', () => {
  const args = fixture();
  const first = createQuickEditZoomRegion({ id: 'first', at: 2, duration: 3 });
  first.transform = { scale: 1.6, centerX: 0.3, centerY: 0.5 };
  const second = createQuickEditZoomRegion({ id: 'second', at: 6, duration: 3 });
  second.transform = { scale: 2, centerX: 0.7, centerY: 0.6 };
  first.linkTo = second.id;
  args.scene.zoomRegions = [first, second];
  const comment = {
    ...createCanvasComment({ id: 'comment', start: 1, end: 9, position: { x: 0.5, y: 0.6 } }),
    renderToVideo: true,
    resolvedText: 'Many words in the comment to wrap',
  };
  args.scene.comments = [comment];
  const areas = reviewCaptionReservations(args);
  for (let time = 1; time < 9; time += 0.1) {
    const camera = evaluateQuickEditCameraAtTime(args.scene.zoomRegions, time);
    const layout = computeQuickEditSceneLayout({
      output,
      source: output,
      background: args.scene.background,
      camera,
    });
    const box = measureReviewComment(args.context, comment, {
      canvas: output,
      videoTransform: layout.videoTransform,
      scale: camera.scale,
    }).box!;
    const clipped = {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.min(output.width, box.x + box.width) - Math.max(0, box.x),
      height: Math.min(output.height, box.y + box.height) - Math.max(0, box.y),
    };
    if (clipped.width > 0 && clipped.height > 0)
      expect(
        areas.some((area) => area.start <= time && time < area.end && contains(area, clipped))
      ).toBe(true);
  }
});

it('keeps a short moving comment near the top from reserving the unrelated bottom caption area', () => {
  const args = fixture();
  const zoom = createQuickEditZoomRegion({ id: 'zoom', at: 2, duration: 4 });
  zoom.transform = { scale: 1.6, centerX: 0.5, centerY: 0.5 };
  args.scene.zoomRegions = [zoom];
  args.scene.comments = [
    {
      ...createCanvasComment({
        id: 'comment',
        start: 1,
        end: 7,
        position: { x: 0.5, y: 0.1 },
        placement: 'below',
      }),
      renderToVideo: true,
      resolvedText: 'Hi',
    },
  ];
  expect(reviewCaptionReservations(args).every((area) => area.y + area.height < 200)).toBe(true);
});
