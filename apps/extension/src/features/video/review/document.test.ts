import { describe, expect, it } from 'vitest';
import { applyReviewOperation, replayReviewHistory } from './document';
import { createCanvasComment } from './comments';
import type { ReviewAnnotation, ReviewOperation, ReviewSource } from './types';

const source: ReviewSource = {
  duration: 12,
  width: 640,
  height: 360,
  mimeType: 'video/mp4',
  size: 1000,
};
const annotation: ReviewAnnotation = {
  id: 'a',
  text: 'Check this',
  anchor: { kind: 'point', time: 3 },
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
};
const added: ReviewOperation = {
  id: 'op1',
  at: 1,
  target: 'annotation',
  before: null,
  after: annotation,
};

describe('video review history', () => {
  it('replays canvas comment operations like other targets at every cursor', () => {
    const comment = createCanvasComment({ id: 'c1', at: 2 });
    const edited = { ...comment, text: 'Now with text' };
    const history: ReviewOperation[] = [
      { id: 'op1', at: 1, target: 'canvasComment', before: null, after: comment },
      { id: 'op2', at: 2, target: 'canvasComment', before: comment, after: edited },
      { id: 'op3', at: 3, target: 'canvasComment', before: edited, after: null },
    ];
    expect(replayReviewHistory(history, 0, source).canvasComments).toEqual([]);
    expect(replayReviewHistory(history, 1, source).canvasComments).toEqual([comment]);
    expect(replayReviewHistory(history, 2, source).canvasComments).toEqual([edited]);
    expect(replayReviewHistory(history, 3, source).canvasComments).toEqual([]);
    expect(comment.text).toBe('');
  });

  it('replays add, edit and delete at every undo cursor without mutating earlier values', () => {
    const edited = { ...annotation, text: 'Corrected text' };
    const history: ReviewOperation[] = [
      added,
      { id: 'op2', at: 2, target: 'annotation', before: annotation, after: edited },
      { id: 'op3', at: 3, target: 'annotation', before: edited, after: null },
    ];
    expect(replayReviewHistory(history, 0, source).annotations).toEqual([]);
    expect(replayReviewHistory(history, 1, source).annotations).toEqual([annotation]);
    expect(replayReviewHistory(history, 2, source).annotations).toEqual([edited]);
    expect(replayReviewHistory(history, 3, source).annotations).toEqual([]);
    expect(annotation.text).toBe('Check this');
  });

  it('retains independent regions at the same timestamp, including on removed video', () => {
    const history: ReviewOperation[] = [
      added,
      { ...added, id: 'op2', after: { ...annotation, id: 'b', text: 'Second region' } },
      {
        id: 'cut',
        at: 3,
        target: 'edit',
        before: null,
        after: { id: 'c', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
      },
    ];
    const result = replayReviewHistory(history, 3, source);
    expect(result.annotations).toHaveLength(2);
    expect(result.edits).toHaveLength(1);
  });

  it('rejects stale before-values, identity changes, no-op commits and invalid cursors', () => {
    const document = replayReviewHistory([added], 1, source);
    expect(() => applyReviewOperation(document, added, source)).toThrow('does not match');
    expect(() =>
      applyReviewOperation(document, { ...added, before: annotation, after: annotation }, source)
    ).toThrow('no change');
    expect(() =>
      applyReviewOperation(
        document,
        { ...added, before: annotation, after: { ...annotation, id: 'b' } },
        source
      )
    ).toThrow('identity');
    for (const cursor of [-1, 2, NaN, 0.5])
      expect(() => replayReviewHistory([added], cursor, source)).toThrow('cursor');
  });

  it('rejects overlapping edits and a fully removed output, but permits adjacent edits', () => {
    const cut: ReviewOperation = {
      id: 'cut',
      at: 1,
      target: 'edit',
      before: null,
      after: { id: 'c', kind: 'cut', start: 0, end: 4, requestedStart: 0, requestedEnd: 4 },
    };
    const document = replayReviewHistory([cut], 1, source);
    const speed: ReviewOperation = {
      id: 'speed',
      at: 2,
      target: 'edit',
      before: null,
      after: {
        id: 's',
        kind: 'speed',
        start: 3,
        end: 6,
        requestedStart: 3,
        requestedEnd: 6,
        rate: 2,
        audio: 'mute',
      },
    };
    expect(() => applyReviewOperation(document, speed, source)).toThrow('overlap');
    expect(() =>
      applyReviewOperation(document, { ...speed, after: { ...speed.after!, start: 4 } }, source)
    ).not.toThrow();
    expect(() =>
      applyReviewOperation(
        document,
        {
          ...cut,
          after: { id: 'd', kind: 'cut', start: 4, end: 12, requestedStart: 4, requestedEnd: 12 },
        },
        source
      )
    ).toThrow('entire');
  });
});
