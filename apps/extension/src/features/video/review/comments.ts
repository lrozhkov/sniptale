import { createSolidPaint } from '@sniptale/foundation/paint';
import type { CanvasComment, ReviewAnnotation, ReviewDocument } from './types';
import {
  quickEditCanvasPointToContent,
  quickEditContentPointToCanvas,
  type QuickEditRect,
} from './advanced/scene';

/** Defaults mirror the scenario-editor bubble chrome without custom CSS. */
export const CANVAS_COMMENT_DEFAULTS: CanvasComment['style'] = {
  fillPaint: createSolidPaint('#ffffff'),
  textColor: '#111827',
  radius: 14,
};

/** Bubble presets keep preview and export on one shared visual contract. */
export const CANVAS_COMMENT_STYLE_PRESETS: readonly CanvasComment['style'][] = [
  CANVAS_COMMENT_DEFAULTS,
  { fillPaint: createSolidPaint('#111827'), textColor: '#ffffff', radius: 14 },
  { fillPaint: createSolidPaint('#fef3c7'), textColor: '#111827', radius: 14 },
];

/** Shared bubble geometry in output pixels; the preview scales it with the stage. */
export const CANVAS_COMMENT_BUBBLE = {
  maxWidth: 224,
  fontSize: 12,
  lineHeight: 16,
  paddingX: 10,
  paddingY: 6,
  gap: 12,
  pointRadius: 7,
  pulsePeriod: 1,
} as const;

/** Overlay comments are markers even without text; the point itself is the message. */
export const CANVAS_COMMENT_LIMITS = { maxComments: 100, maxTextLength: 100_000 } as const;

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/** New overlay comments start at the playhead and stay visible until the video ends. */
export function createCanvasComment(args: {
  id: string;
  at?: number;
  start?: number;
  end?: number;
  annotationId?: string;
  position?: { x: number; y: number };
  placement?: 'above' | 'below';
}): CanvasComment {
  return {
    id: args.id,
    ...(args.annotationId ? { annotationId: args.annotationId } : {}),
    text: '',
    ...(args.at === undefined
      ? {
          ...(args.start === undefined ? {} : { start: args.start }),
          ...(args.end === undefined ? {} : { end: args.end }),
        }
      : { start: args.at }),
    visible: true,
    renderToVideo: true,
    attachment: 'content',
    position: args.position ? { x: args.position.x, y: args.position.y } : { x: 0.5, y: 0.5 },
    ...(args.placement ? { placement: args.placement } : {}),
    style: { ...CANVAS_COMMENT_DEFAULTS, fillPaint: { ...CANVAS_COMMENT_DEFAULTS.fillPaint } },
  };
}

/** Applies a patch with bounded positions; times stay on the original video when known. */
export function updateCanvasComment(
  comment: CanvasComment,
  patch: Partial<Omit<CanvasComment, 'id'>>
): CanvasComment {
  return {
    ...comment,
    ...patch,
    position: patch.position
      ? { x: clampUnit(patch.position.x), y: clampUnit(patch.position.y) }
      : comment.position,
  };
}

/** A comment covers the playhead when its optional window contains it. */
export function isCanvasCommentVisibleAt(comment: CanvasComment, time: number): boolean {
  if (!comment.visible) return false;
  if (comment.start !== undefined && time < comment.start) return false;
  if (comment.end !== undefined && time > comment.end) return false;
  return true;
}

/** The linked annotation owns the text; standalone overlays keep their own text. */
export function canvasCommentText(
  comment: CanvasComment,
  annotations: readonly ReviewAnnotation[]
): string {
  if (comment.annotationId) {
    return annotations.find((item) => item.id === comment.annotationId)?.text ?? '';
  }
  return comment.text;
}

/**
 * Export-ready overlay list: one resolution point for linked text so the renderer
 * never has to couple with the annotation store.
 */
export type CanvasCommentExport = CanvasComment & { resolvedText: string };

export function resolveOverlayComments(
  document: Pick<ReviewDocument, 'annotations' | 'canvasComments'>
): CanvasCommentExport[] {
  return document.canvasComments.map((comment) => ({
    ...comment,
    resolvedText: canvasCommentText(comment, document.annotations),
  }));
}

/**
 * Shared pulse phase as a pure function of media time and the comment window:
 * preview rendering and export drawing evaluate the same deterministic phase.
 */
export function overlayPulsePhase(time: number, start: number | undefined): number {
  const elapsed = time - (start ?? 0);
  const period = CANVAS_COMMENT_BUBBLE.pulsePeriod;
  return (((elapsed % period) + period) % period) / period;
}

/** Maps an annotation anchor onto the overlay time window it should cover. */
export function showOnVideoWindow(anchor: ReviewAnnotation['anchor']): {
  start?: number;
  end?: number;
} {
  if (anchor.kind === 'point') return { start: anchor.time };
  return { start: anchor.start, end: anchor.end };
}

/**
 * Bounds and orders a resolved overlay time window against the original video:
 * each bound is clamped into [0, duration]. When both bounds arrive ordered
 * wrongly, end is lifted to start + 0.1 so a newly typed start survives; export
 * shares the same limits. The editor merges its numeric input into a complete
 * window before calling.
 */
export function clampCanvasCommentTimes(
  comment: CanvasComment,
  patch: { start?: number | undefined; end?: number | undefined },
  duration: number
): { start?: number; end?: number } {
  const hasStart = 'start' in patch;
  const hasEnd = 'end' in patch;
  const start = hasStart
    ? patch.start === undefined
      ? undefined
      : Math.max(0, Math.min(patch.start, duration))
    : comment.start;
  const end = hasEnd
    ? patch.end === undefined
      ? undefined
      : Math.max(0, Math.min(patch.end, duration))
    : comment.end;
  if (start !== undefined && end !== undefined && end <= start) {
    if (hasEnd && !hasStart) return { start, end: Math.min(start + 0.1, duration) };
    if (hasStart && !hasEnd) return { start: Math.max(0, end - 0.1), end };
    return { start, end: Math.min(start + 0.1, duration) };
  }
  return {
    ...(start === undefined ? {} : { start }),
    ...(end === undefined ? {} : { end }),
  };
}

/**
 * Attachment switch keeps the point on the same visual spot of the current frame:
 * it re-expresses the current composition point in the other coordinate space.
 * Viewport-to-content denies instead of silently clamping when the point sits on
 * the background outside the video.
 */
export function switchCanvasCommentAttachment(
  comment: CanvasComment,
  attachment: CanvasComment['attachment'],
  geometry: { output: { width: number; height: number }; videoTransform: QuickEditRect | null }
): { position: { x: number; y: number } } | null {
  const canvasPoint =
    comment.attachment === 'content' && geometry.videoTransform
      ? quickEditContentPointToCanvas(comment.position, geometry.videoTransform)
      : {
          x: comment.position.x * geometry.output.width,
          y: comment.position.y * geometry.output.height,
        };
  if (attachment === 'viewport') {
    return {
      position: {
        x: canvasPoint.x / geometry.output.width,
        y: canvasPoint.y / geometry.output.height,
      },
    };
  }
  if (!geometry.videoTransform) return null;
  const content = quickEditCanvasPointToContent(canvasPoint, geometry.videoTransform);
  return content ? { position: content } : null;
}
