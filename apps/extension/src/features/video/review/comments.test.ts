import { expect, it } from 'vitest';
import {
  CANVAS_COMMENT_DEFAULTS,
  createCanvasComment,
  isCanvasCommentVisibleAt,
  updateCanvasComment,
} from './comments';

const styleOf = (comment: { style: { fillPaint: unknown } }) => comment.style.fillPaint;

it('creates content-attached comments at the playhead with scenario bubble defaults', () => {
  const comment = createCanvasComment({ id: 'c1', at: 4 });
  expect(comment).toEqual({
    id: 'c1',
    text: '',
    start: 4,
    visible: true,
    renderToVideo: true,
    attachment: 'content',
    position: { x: 0.5, y: 0.5 },
    style: CANVAS_COMMENT_DEFAULTS,
  });
  expect(createCanvasComment({ id: 'c2' }).start).toBeUndefined();
  expect(styleOf(comment)).toEqual({ kind: 'solid', color: '#ffffffff' });
});

it('clamps drag positions and keeps the identity untouched', () => {
  const comment = createCanvasComment({ id: 'c1' });
  const moved = updateCanvasComment(comment, {
    position: { x: 1.4, y: -0.2 },
    attachment: 'viewport',
    text: 'Hello',
  });
  expect(moved.position).toEqual({ x: 1, y: 0 });
  expect(moved.attachment).toBe('viewport');
  expect(moved.id).toBe('c1');
  expect(updateCanvasComment(comment, {}).position).toEqual(comment.position);
});

it('windows visibility over the playhead and honors the visible flag', () => {
  const comment = createCanvasComment({ id: 'c1', at: 2 });
  expect(isCanvasCommentVisibleAt(comment, 3)).toBe(true);
  expect(isCanvasCommentVisibleAt(comment, 2)).toBe(true);
  expect(isCanvasCommentVisibleAt(comment, 1)).toBe(false);
  expect(isCanvasCommentVisibleAt({ ...comment, end: 4 }, 5)).toBe(false);
  expect(isCanvasCommentVisibleAt({ ...comment, end: 4 }, 4)).toBe(true);
  expect(isCanvasCommentVisibleAt({ ...comment, visible: false }, 3)).toBe(false);
});
