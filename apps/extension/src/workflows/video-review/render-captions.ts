import type { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewFrameExportInput } from './render-export-input';
import { reviewCaptionReservations } from './caption-reservations';
import {
  planReviewCaptions,
  reviewCaptionsAt,
  type ReviewCaptionReservation,
} from '../../features/video/review/caption-plan';
import type {
  ReviewCaptionSettings,
  ReviewTextDocument,
} from '../../features/video/review/text-types';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { QuickEditExportUnavailable } from './export-unavailable';
import { projectReviewTextFragment } from '../../features/video/review/text-projection';

/** Font and canonical cue geometry are prepared once for both preview and final video. */
export async function prepareReviewCaptions(args: {
  document: ReviewTextDocument | undefined;
  settings: ReviewCaptionSettings | undefined;
  segments: readonly ReviewTimeSegment[];
  output: { width: number; height: number };
  signal: AbortSignal;
  resources?: RenderResources;
  reservations?(context: CanvasRenderingContext2D): readonly ReviewCaptionReservation[];
}) {
  args.signal.throwIfAborted();
  const font = (pixels: number) =>
    `400 ${pixels}px "Sniptale Interface", ui-sans-serif, system-ui, sans-serif`;
  const fontText = args.settings?.enabled
    ? args.document?.fragments
        .filter(
          (fragment) =>
            fragment.showInVideo &&
            fragment.text.trim() &&
            projectReviewTextFragment(fragment, args.segments).ranges.length
        )
        .map((fragment) => fragment.text)
        .join('')
    : undefined;
  const visible = Boolean(fontText);
  if (visible) {
    if (!document.fonts) throw new Error('Caption font loading is unavailable.');
    const faces = await document.fonts.load(
      font(args.output.height * args.settings!.style.fontSize),
      `Aa${fontText}`
    );
    args.signal.throwIfAborted();
    if (!faces.length || faces.some((face) => face.status !== 'loaded'))
      throw new Error('Caption font is unavailable.');
  }
  const lease = visible
    ? args.resources?.canvas('caption-measurement', { width: 1, height: 1 })
    : undefined;
  const canvas = visible && !lease ? document.createElement('canvas') : undefined;
  if (canvas) {
    canvas.width = 1;
    canvas.height = 1;
  }
  const context = lease?.context ?? canvas?.getContext('2d');
  try {
    if (visible && !context) throw new Error('Caption measurement is unavailable.');
    const plan = planReviewCaptions({
      document: args.document,
      settings: args.settings,
      segments: args.segments,
      output: args.output,
      measure(text, pixels) {
        if (!context) throw new Error('Caption measurement is unavailable.');
        context.font = font(pixels);
        context.textAlign = 'left';
        const metrics = context.measureText(text);
        return Math.max(
          metrics.width,
          (metrics.actualBoundingBoxLeft ?? 0) + (metrics.actualBoundingBoxRight ?? 0)
        );
      },
      reservations: context ? args.reservations?.(context) : undefined,
    });
    args.signal.throwIfAborted();
    return {
      plan,
      assertExportable(range?: { start: number; end: number }) {
        const conflicts = range
          ? plan.conflicts.filter((entry) => entry.start < range.end && range.start < entry.end)
          : plan.conflicts;
        if (conflicts.length) throw new QuickEditExportUnavailable(['caption-layout'], conflicts);
      },
      draw(target: CanvasRenderingContext2D, resultTime: number) {
        target.save();
        try {
          target.globalAlpha = 1;
          target.globalCompositeOperation = 'source-over';
          target.textAlign = 'center';
          target.textBaseline = 'middle';
          for (const cue of reviewCaptionsAt(plan, resultTime)) {
            target.fillStyle = cue.style.background;
            target.beginPath();
            const height = cue.lines.length * cue.lineHeight + cue.padding * 2;
            const y = cue.style.position === 'bottom' ? cue.y + cue.height - height : cue.y;
            target.roundRect(cue.x, y, cue.width, height, cue.padding);
            target.fill();
            target.font = font(cue.pixels);
            target.fillStyle = cue.style.color;
            // Bottom cues share their last line baseline even when a cue has one line.
            const first =
              cue.style.position === 'bottom'
                ? cue.y + cue.height - cue.padding - cue.lines.length * cue.lineHeight
                : cue.y + cue.padding;
            cue.lines.forEach((line, index) =>
              target.fillText(line, cue.x + cue.width / 2, first + (index + 0.5) * cue.lineHeight)
            );
          }
        } finally {
          target.restore();
        }
      },
    };
  } finally {
    lease?.release();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

/** Ordinary final render admits global caption geometry before output encoding begins. */
export async function prepareReviewFinalCaptions(args: {
  input: Pick<
    ReviewFrameExportInput,
    | 'index'
    | 'edits'
    | 'captionTimeMap'
    | 'fragmentOffset'
    | 'comments'
    | 'keyCues'
    | 'clickCues'
    | 'signal'
  >;
  effective: Pick<
    ReturnType<typeof resolveQuickEditEffectiveState>,
    | 'canvas'
    | 'background'
    | 'windowHeader'
    | 'watermark'
    | 'webcam'
    | 'zoomRegions'
    | 'text'
    | 'captions'
  >;
  source: { size: { width: number; height: number }; output: { width: number; height: number } };
  webcamDuration: number | undefined;
  watermarkBounds: { x: number; y: number; width: number; height: number };
  resultDuration: number;
}) {
  const { input, effective, source } = args;
  if (effective.captions && document.fonts) await document.fonts.ready;
  input.signal.throwIfAborted();
  const scene = {
    source: source.size,
    ...(effective.canvas ? { canvas: effective.canvas } : {}),
    background: effective.background,
    windowHeader: effective.windowHeader,
    watermark: effective.watermark,
    webcam: effective.webcam,
    webcamDuration: args.webcamDuration,
    zoomRegions: effective.zoomRegions,
    comments: input.comments ?? [],
    keys: input.keyCues ?? [],
    clicks: input.clickCues ?? [],
    captions: {
      document: effective.text,
      settings: effective.captions,
      segments: input.captionTimeMap ?? buildReviewTimeMap(input.index.duration, input.edits),
    },
  };
  const prepared = await prepareReviewCaptions({
    ...scene.captions,
    output: source.output,
    signal: input.signal,
    reservations: (context) =>
      reviewCaptionReservations({
        scene,
        context,
        output: source.output,
        watermarkBounds: args.watermarkBounds,
      }),
  });
  prepared.assertExportable({
    start: input.fragmentOffset,
    end: input.fragmentOffset + args.resultDuration,
  });
  return prepared;
}
