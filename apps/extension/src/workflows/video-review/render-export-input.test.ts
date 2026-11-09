import { expect, it } from 'vitest';
import { reviewFrameDecorations } from './render-export-input';
it('omits absent decorations and preserves explicit empty immutable collections without leaking input fields', () => {
  expect(reviewFrameDecorations({})).toEqual({});
  expect(reviewFrameDecorations({ keyCues: undefined })).toEqual({});
  const comments = Object.freeze([]);
  const clickCues = Object.freeze([]);
  const keyCues = Object.freeze([]);
  const result = reviewFrameDecorations({ comments, clickCues, keyCues });
  expect(result.comments).toBe(comments);
  expect(result.clickCues).toBe(clickCues);
  expect(result.keyCues).toBe(keyCues);
  expect(Object.keys(result)).toEqual(['comments', 'clickCues', 'keyCues']);
});

it('passes the job-owned history reader through frame decorations without copying it', () => {
  const recordingHistory = {
    read: async () => {
      throw new Error('unused');
    },
    dispose() {},
  };
  expect(reviewFrameDecorations({ recordingHistory }).recordingHistory).toBe(recordingHistory);
});
