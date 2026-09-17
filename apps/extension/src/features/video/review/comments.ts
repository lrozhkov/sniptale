import { createSolidPaint } from '@sniptale/foundation/paint';
import type { CanvasComment } from './types';

/** Defaults mirror the scenario-editor bubble chrome without custom CSS. */
export const CANVAS_COMMENT_DEFAULTS: CanvasComment['style'] = {
  fillPaint: createSolidPaint('#ffffff'),
  textColor: '#111827',
  radius: 14,
};

/** Overlay comments are markers even without text; the point itself is the message. */
export const CANVAS_COMMENT_LIMITS = { maxComments: 100, maxTextLength: 100_000 } as const;

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/** New overlay comments start at the playhead and stay visible until the video ends. */
export function createCanvasComment(args: { id: string; at?: number }): CanvasComment {
  return {
    id: args.id,
    text: '',
    ...(args.at === undefined ? {} : { start: args.at }),
    visible: true,
    renderToVideo: true,
    attachment: 'content',
    position: { x: 0.5, y: 0.5 },
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
