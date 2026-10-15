import { measureKeystroke } from '../../features/video/composition/draw/effects/keystrokes';
import { resolveVideoMediaShadowParams } from '../../features/video/composition/canvas/media-shadow';
import { canvasCommentBubble } from '../../features/video/review/comments';
import {
  computeQuickEditSceneLayout,
  evaluateQuickEditCameraAtTime,
} from '../../features/video/review/advanced/scene';
import {
  quickEditWebcamBounds,
  quickEditWebcamFrameAt,
} from '../../features/video/review/advanced/webcam';
import { resolveQuickEditWatermarkTile } from '../../features/video/review/advanced/watermark';
import type { ReviewCaptionReservation } from '../../features/video/review/caption-plan';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';
import type { PreviewScene } from './preview-scene';
import { measureReviewComment } from './render-comments';

type Rect = Pick<ReviewCaptionReservation, 'x' | 'y' | 'width' | 'height'>;
const union = (rects: readonly Rect[]): Rect => {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y,
  };
};

function projectSourceInterval(start: number, end: number, segments: readonly ReviewTimeSegment[]) {
  return segments.flatMap((segment) => {
    const from = Math.max(start, segment.sourceStart);
    const to = Math.min(end, segment.sourceEnd);
    return segment.kind !== 'cut' && to > from
      ? [
          {
            start: segment.resultStart + (from - segment.sourceStart) / segment.rate,
            end: segment.resultStart + (to - segment.sourceStart) / segment.rate,
          },
        ]
      : [];
  });
}

type ReservationInput = {
  scene: PreviewScene;
  context: CanvasRenderingContext2D;
  output: { width: number; height: number };
  watermarkBounds: Rect;
};
type AddReservation = (rect: Rect, start: number, end: number, conservative?: boolean) => void;

function reserveCaptionWatermark(args: ReservationInput, duration: number, add: AddReservation) {
  const { scene, output } = args;
  const watermark = scene.watermark;
  if (
    watermark &&
    watermark.mode !== 'none' &&
    args.watermarkBounds.width > 0 &&
    args.watermarkBounds.height > 0
  ) {
    if (watermark.layout !== 'tiled') add(args.watermarkBounds, 0, duration);
    else {
      const tile = resolveQuickEditWatermarkTile(watermark, output, args.watermarkBounds);
      for (let row = 0; row < tile.rows; row++)
        for (let column = 0; column < tile.columns; column++)
          add(
            {
              x: (column - 0.5) * tile.stepX - tile.width / 2,
              y: (row - 0.5) * tile.stepY - tile.height / 2,
              width: tile.width,
              height: tile.height,
            },
            0,
            duration,
            tile.rotation !== 0
          );
    }
  }
}

function reserveCaptionKeys(args: ReservationInput, add: AddReservation) {
  const { scene, context, output } = args;
  // A newer key in the same position replaces the older one in the existing painter.
  const keys = [...scene.keys].sort((a, b) => a.start - b.start);
  const nextStart = new Map<string, number>();
  for (let index = keys.length - 1; index >= 0; index--) {
    const cue = keys[index]!;
    const position = cue.settings.style.position;
    const end = Math.min(cue.end, nextStart.get(position) ?? Infinity);
    nextStart.set(position, cue.start);
    const measured = measureKeystroke(
      context,
      { event: { label: cue.label }, keyStyle: cue.settings.style },
      output.width / 1920,
      { x: 0, y: 0, ...output }
    );
    if (measured)
      add(
        {
          ...measured,
          y: measured.y - (measured.top ? measured.travel : 0),
          height: measured.height + measured.travel,
        },
        cue.start,
        end,
        measured.travel > 0
      );
  }
}

function reserveCaptionWebcam(
  args: ReservationInput,
  segments: readonly ReviewTimeSegment[],
  add: AddReservation
) {
  const { scene, output } = args;
  const sourceDuration = segments.at(-1)?.sourceEnd ?? 0;
  const webcam = scene.webcam;
  if (webcam?.enabled && scene.webcamDuration !== undefined) {
    const boundaries = [
      ...new Set([
        0,
        sourceDuration,
        webcam.offsetSeconds,
        webcam.offsetSeconds + scene.webcamDuration,
        ...webcam.hiddenRanges.flatMap((range) => [range.start, range.end]),
        ...webcam.positions.flatMap((position, index) => [
          position.time,
          position.time +
            Math.min(
              position.transition.duration,
              (webcam.positions[index + 1]?.time ?? Infinity) - position.time
            ),
        ]),
      ]),
    ]
      .filter((time) => time >= 0 && time <= sourceDuration)
      .sort((a, b) => a - b);
    for (let index = 0; index + 1 < boundaries.length; index++) {
      const start = boundaries[index]!,
        end = boundaries[index + 1]!;
      const frame = quickEditWebcamFrameAt(webcam, (start + end) / 2, scene.webcamDuration);
      if (!frame) continue;
      const positionIndex = webcam.positions.findLastIndex((position) => position.time <= start);
      const position = webcam.positions[positionIndex];
      const transitioning =
        !!position &&
        position.transition.type !== 'none' &&
        start < position.time + position.transition.duration;
      const placements = transitioning
        ? [webcam.positions[positionIndex - 1]?.placement ?? webcam.placement, position.placement]
        : [frame.placement];
      // Full placement endpoints bound both ease and the inward shrink transition.
      const boxes = placements.map((placement) => ({
        x: placement.x * output.width,
        y: placement.y * output.height,
        width: placement.width * output.width,
        height: placement.height * output.height,
      }));
      if (!transitioning) {
        const bounds = quickEditWebcamBounds(frame.placement, output, webcam.appearance.shape);
        boxes[0] = {
          x: bounds.x * output.width,
          y: bounds.y * output.height,
          width: bounds.width * output.width,
          height: bounds.height * output.height,
        };
      }
      const shadow = resolveVideoMediaShadowParams(
        webcam.shadow?.intensity,
        Math.min(output.width, output.height) / 720,
        undefined,
        true
      );
      const bleed = shadow
        ? Math.ceil(shadow.blur + Math.max(Math.abs(shadow.offsetX), Math.abs(shadow.offsetY)) + 2)
        : 0;
      const box = union(boxes);
      for (const range of projectSourceInterval(start, end, segments))
        add(
          {
            x: box.x - bleed,
            y: box.y - bleed,
            width: box.width + 2 * bleed,
            height: box.height + 2 * bleed,
          },
          range.start,
          range.end,
          transitioning || bleed > 0
        );
    }
  }
}

/** Native comment typography bounds translation, scale, pulse and text reflow. */
function measureCaptionCommentEnvelope(
  args: ReservationInput,
  comment: PreviewScene['comments'][number],
  cameras: ReturnType<typeof evaluateQuickEditCameraAtTime>[]
): Rect {
  const { scene, context, output } = args;
  const moving =
    comment.attachment === 'content' &&
    cameras.some(
      (camera) =>
        camera.scale !== cameras[0]!.scale ||
        camera.centerX !== cameras[0]!.centerX ||
        camera.centerY !== cameras[0]!.centerY
    );
  const measurements = cameras.map((camera) => {
    const layout = computeQuickEditSceneLayout({
      output,
      source: scene.source,
      canvas: scene.canvas,
      background: scene.background,
      windowHeader: scene.windowHeader,
      camera,
    });
    const scale = comment.attachment === 'content' ? camera.scale : 1;
    const measurement = measureReviewComment(context, comment, {
      canvas: output,
      videoTransform: comment.attachment === 'content' ? layout.videoTransform : null,
      scale,
    });
    return { measurement, scale };
  });
  // One extra line bounds reflow between endpoint scales, including the native
  // comment painter's height cap, without reserving an entire frame for short text.
  const maximumHeight =
    Math.max(...measurements.map(({ measurement }) => measurement.box?.height ?? 0)) +
    Math.max(
      ...measurements.map(({ scale }) => canvasCommentBubble(comment.style).lineHeight * scale)
    );
  const boxes = measurements.flatMap(({ measurement, scale }) => {
    const radius = measurement.pointRadius * 2.4 + scale;
    const point = {
      x: measurement.point.x - radius,
      y: measurement.point.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
    if (!measurement.box) return [point];
    if (!moving) return [point, measurement.box];
    // Translation and scale interpolate monotonically; reserve the shared typography's
    // maximum box around each endpoint so line wrapping cannot escape the envelope.
    const bubble = canvasCommentBubble(comment.style, {
      width: output.width / scale,
      height: output.height / scale,
    });
    const width = bubble.maxWidth * scale,
      height = Math.min(bubble.maxHeight * scale, maximumHeight);
    return [
      point,
      {
        x: measurement.point.x - width / 2,
        y:
          comment.placement === 'below'
            ? measurement.point.y + (bubble.pointRadius + bubble.gap) * scale
            : measurement.point.y - (bubble.pointRadius + bubble.gap) * scale - height,
        width,
        height,
      },
    ];
  });
  return union(boxes);
}

function reserveCaptionComments(
  args: ReservationInput,
  segments: readonly ReviewTimeSegment[],
  add: AddReservation
) {
  const { scene, output } = args;
  const duration = segments.at(-1)?.resultEnd ?? 0;
  const sourceDuration = segments.at(-1)?.sourceEnd ?? 0;
  const cameraTimes = [
    ...new Set([
      0,
      duration,
      ...scene.zoomRegions.flatMap((region) => [
        region.start,
        region.start + region.enter.duration,
        region.end - region.exit.duration,
        region.end,
      ]),
    ]),
  ]
    .filter((time) => time >= 0 && time <= duration)
    .sort((a, b) => a - b);
  for (const comment of scene.comments) {
    if (!comment.renderToVideo) continue;
    for (const range of projectSourceInterval(
      comment.start ?? 0,
      comment.end ?? sourceDuration,
      segments
    )) {
      const boundaries = [
        range.start,
        ...cameraTimes.filter((time) => time > range.start && time < range.end),
        range.end,
      ];
      for (let index = 0; index + 1 < boundaries.length; index++) {
        const start = boundaries[index]!,
          end = boundaries[index + 1]!;
        const cameras = [start, (start + end) / 2, end].map((time) =>
          evaluateQuickEditCameraAtTime(scene.zoomRegions, time, { ...scene, output })
        );
        if (comment.attachment === 'content' && cameras.some((camera) => camera.spatial)) {
          // Projected comments ride the spatial raster. Its moving crop is conservative.
          add({ x: 0, y: 0, ...output }, start, end, true);
          continue;
        }
        add(measureCaptionCommentEnvelope(args, comment, cameras), start, end, true);
      }
    }
  }
}

/** Disposable overlay bounds in the same canonical output and clock as caption cues. */
export function reviewCaptionReservations(args: ReservationInput): ReviewCaptionReservation[] {
  const { scene, output } = args;
  const segments = scene.captions?.segments ?? [];
  const duration = segments.at(-1)?.resultEnd ?? 0;
  const reservations: ReviewCaptionReservation[] = [];
  const add = (rect: Rect, start: number, end: number, conservative = false) => {
    const x = Math.max(0, rect.x),
      y = Math.max(0, rect.y);
    const width = Math.min(output.width, rect.x + rect.width) - x;
    const height = Math.min(output.height, rect.y + rect.height) - y;
    if (end > start && width > 0 && height > 0)
      reservations.push({
        x,
        y,
        width,
        height,
        start,
        end,
        ...(conservative ? { conservative } : {}),
      });
  };
  reserveCaptionWatermark(args, duration, add);
  reserveCaptionKeys(args, add);
  reserveCaptionWebcam(args, segments, add);
  reserveCaptionComments(args, segments, add);
  return reservations;
}
