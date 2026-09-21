import { expect, it } from 'vitest';
import type { ReviewAnnotation } from './types';
import type { QuickEditRect } from './advanced/scene';
import {
  CANVAS_COMMENT_BUBBLE,
  CANVAS_COMMENT_DEFAULTS,
  canvasCommentText,
  clampCanvasCommentTimes,
  createCanvasComment,
  isCanvasCommentVisibleAt,
  overlayPulsePhase,
  showOnVideoWindow,
  switchCanvasCommentAttachment,
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

it('resolves linked text from the annotation and keeps standalone text', () => {
  const annotations: ReviewAnnotation[] = [
    { id: 'a1', text: 'Saved note', anchor: { kind: 'point', time: 2 } },
  ];
  const linked = createCanvasComment({ id: 'c1', at: 2, annotationId: 'a1' });
  expect(canvasCommentText(linked, annotations)).toBe('Saved note');
  expect(canvasCommentText(linked, [])).toBe('');
  const standalone = createCanvasComment({ id: 'c2', at: 1 });
  expect(canvasCommentText(updateCanvasComment(standalone, { text: 'Own' }), [])).toBe('Own');
});

it('maps annotation anchors onto overlay windows', () => {
  const point = showOnVideoWindow({ kind: 'point', time: 3 });
  expect(point).toEqual({ start: 3, end: undefined });
  const range = showOnVideoWindow({ kind: 'range', start: 1, end: 5 });
  expect(range).toEqual({ start: 1, end: 5 });
});

it('derives a deterministic pulse phase from media time and the window start', () => {
  const period = CANVAS_COMMENT_BUBBLE.pulsePeriod;
  expect(overlayPulsePhase(2, 2)).toBe(0);
  expect(overlayPulsePhase(2.5, 2)).toBeCloseTo(0.5, 5);
  expect(overlayPulsePhase(3.25, 2)).toBeCloseTo(0.25, 5);
  expect(overlayPulsePhase(1.5, undefined)).toBeCloseTo((1.5 % period) / period, 5);
  expect(overlayPulsePhase(0.5, 2)).toBeCloseTo(0.5, 5);
});

it('switches attachment around the same visual point and denies background points', () => {
  const output = { width: 800, height: 400 };
  const videoTransform: QuickEditRect = { x: 100, y: 50, width: 600, height: 300 };
  const content = { ...createCanvasComment({ id: 'c' }), position: { x: 0.5, y: 0.5 } };
  const toViewport = switchCanvasCommentAttachment(content, 'viewport', {
    output,
    videoTransform,
  });
  expect(toViewport).toEqual({ position: { x: 0.5, y: 0.5 } });
  const viewportComment = {
    ...content,
    attachment: 'viewport' as const,
    position: { x: 0.5, y: 0.5 },
  };
  expect(
    switchCanvasCommentAttachment(viewportComment, 'content', { output, videoTransform })
  ).toEqual({ position: { x: 0.5, y: 0.5 } });
  const offVideoContent = { ...content, position: { x: 0.1, y: 0.9 } };
  expect(
    switchCanvasCommentAttachment(offVideoContent, 'viewport', { output, videoTransform })
  ).toEqual({ position: { x: 0.2, y: 0.8 } });
  const offVideoViewport = { ...offVideoContent, attachment: 'viewport' as const };
  expect(
    switchCanvasCommentAttachment(offVideoViewport, 'content', { output, videoTransform })
  ).toBeNull();
  expect(
    switchCanvasCommentAttachment(content, 'content', { output, videoTransform: null })
  ).toBeNull();
});

it('bounds and orders the overlay time window against the source', () => {
  const comment = createCanvasComment({ id: 'c', at: 2 });
  comment.end = 4;
  expect(clampCanvasCommentTimes(comment, { start: 5, end: 4 }, 6)).toEqual({
    start: 5,
    end: 5.1,
  });
  expect(clampCanvasCommentTimes(comment, { start: 0, end: 0 }, 6)).toEqual({
    start: 0,
    end: 0.1,
  });
  expect(clampCanvasCommentTimes(comment, { start: -1, end: 99 }, 6)).toEqual({
    start: 0,
    end: 6,
  });
  expect(clampCanvasCommentTimes(comment, { start: undefined, end: 4 }, 6)).toEqual({
    end: 4,
  });
  expect(clampCanvasCommentTimes(comment, { start: 3, end: undefined }, 6)).toEqual({
    start: 3,
  });
});
