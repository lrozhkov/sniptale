import { expect, it } from 'vitest';
import {
  patchReviewKeys,
  parseReviewKeyAnimations,
  parseReviewKeyDefaults,
  REVIEW_KEY_DEFAULT,
} from './key-animation';
import { parseVideoProjectActionFeedback, REVIEW_CLICK_DEFAULT } from './validation';

const group = { recordingId: 'recording', sourceInstanceId: 'instance', settings: [], signals: [] };
it('admits complete optional key styles and rejects malformed or duplicate commands', () => {
  expect(parseVideoProjectActionFeedback([group])?.[0]).not.toHaveProperty('keyStyles');
  expect(parseVideoProjectActionFeedback([{ ...group, keyStyles: [] }])?.[0]?.keyStyles).toEqual(
    []
  );
  const keys = patchReviewKeys([], ['key'], { enabled: true });
  expect(parseVideoProjectActionFeedback([{ ...group, keyStyles: keys }])?.[0]?.keyStyles).toEqual(
    keys
  );
  for (const keyStyles of [
    null,
    {},
    [keys[0], keys[0]],
    [{ ...keys[0], before: -1 }],
    [{ ...keys[0], after: 0 }],
    [{ ...keys[0], offset: Infinity }],
    [{ ...keys[0], style: { ...keys[0]!.style, fontFamily: 'unknown' } }],
  ])
    expect(parseVideoProjectActionFeedback([{ ...group, keyStyles }])).toBeNull();
  expect(parseReviewKeyAnimations(undefined)).toBeUndefined();
});
it('keeps parser and patch values independent from the incoming authored objects', () => {
  const raw = [{ id: 'key', ...REVIEW_KEY_DEFAULT, style: { ...REVIEW_KEY_DEFAULT.style } }];
  const parsed = parseVideoProjectActionFeedback([{ ...group, keyStyles: raw }])!;
  raw[0]!.style.fontSize = 80;
  expect(parsed[0]!.keyStyles![0]!.style.fontSize).toBe(24);
  const changed = patchReviewKeys(parsed[0]!.keyStyles!, ['key'], {
    style: { color: '#12345680' },
  });
  expect(changed[0]!.style.color).toBe('#12345680');
  expect(parsed[0]!.keyStyles![0]!.style.color).toBe('#ffffff');
  expect(() => patchReviewKeys([], ['bad'], { after: -1 })).toThrow();
});
it('bounds total authored feedback across source groups without rejecting valid legacy styles', () => {
  const keys = Array.from({ length: 10000 }, (_, index) => ({
    id: String(index),
    ...REVIEW_KEY_DEFAULT,
  }));
  expect(parseVideoProjectActionFeedback([{ ...group, keyStyles: keys }])).not.toBeNull();
  expect(
    parseVideoProjectActionFeedback([
      { ...group, keyStyles: keys },
      { ...group, sourceInstanceId: 'other', keyStyles: [keys[0]] },
    ])
  ).toBeNull();
});

it('admits the independently bounded click and key authoring from a valid Gallery source', () => {
  const keyStyles = Array.from({ length: 10000 }, (_, index) => ({
    id: String(index),
    ...REVIEW_KEY_DEFAULT,
  }));
  const gestureStyles = Array.from({ length: 10000 }, (_, index) => ({
    id: String(index),
    ...REVIEW_CLICK_DEFAULT,
  }));
  expect(parseVideoProjectActionFeedback([{ ...group, keyStyles, gestureStyles }])).not.toBeNull();
});

it('admits source key defaults only with an event stream and counts them in the authored style budget', () => {
  const events = {
    format: 'recording-events-v1',
    formatVersion: 1,
    algorithm: 'lossless-v1',
    encoding: 'json-utf8-v1',
    eventStreamId: 'a'.repeat(32),
    state: 'complete',
    finalized: true,
    totalBlocks: 1,
    totalRecords: 3,
    totalBytes: 1000,
    streamSha256: 'b'.repeat(64),
  };
  const raw = { ...group, events, keyDefaults: REVIEW_KEY_DEFAULT };
  expect(parseVideoProjectActionFeedback([raw])?.[0]?.keyDefaults).toEqual(REVIEW_KEY_DEFAULT);
  expect(
    parseVideoProjectActionFeedback([{ ...group, keyDefaults: REVIEW_KEY_DEFAULT }])
  ).toBeNull();
  expect(parseReviewKeyDefaults(undefined)).toBeUndefined();
  for (const keyDefaults of [
    null,
    { ...REVIEW_KEY_DEFAULT, before: -1 },
    { ...REVIEW_KEY_DEFAULT, id: 'captured' },
    { ...REVIEW_KEY_DEFAULT, extra: true },
  ])
    expect(parseVideoProjectActionFeedback([{ ...raw, keyDefaults }])).toBeNull();
  const keyStyles = Array.from({ length: 10000 }, (_, index) => ({
    id: String(index),
    ...REVIEW_KEY_DEFAULT,
  }));
  expect(parseVideoProjectActionFeedback([{ ...raw, keyStyles }])).toBeNull();
  expect(
    parseVideoProjectActionFeedback([{ ...raw, keyStyles: keyStyles.slice(1) }])
  ).not.toBeNull();
});
