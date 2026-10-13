import { expect, it } from 'vitest';
import { parseReviewKeyAnimations, patchReviewKeys } from './advanced/key-animation';
import { scheduleReviewKeys } from './key-animation';
import { buildReviewTimeMap } from './timeline';
import { createQuickEditAdvancedContent, createQuickEditAdvancedState } from './advanced/defaults';
import { loadQuickEditAdvancedContentState } from './advanced/validation';
import { reviewAdvancedContentBaseline, replayReviewHistory } from './document';
import { resolveQuickEditExportPlan } from './advanced/effective';

it('preserves optional absence and strict styles in persisted content and replay', () => {
  expect(parseReviewKeyAnimations(undefined)).toBeUndefined();
  const keys = patchReviewKeys([], ['key'], { enabled: true });
  const before = createQuickEditAdvancedContent(),
    after = { ...before, keyAnimations: keys };
  expect(loadQuickEditAdvancedContentState(after)).toEqual(after);
  expect(
    reviewAdvancedContentBaseline({ ...createQuickEditAdvancedState(), keyAnimations: keys })
  ).toEqual(after);
  for (const value of [
    { ...keys[0], after: NaN },
    { ...keys[0], enabled: 1 },
    { ...keys[0], style: { ...keys[0]!.style, fontSize: 999 } },
  ])
    expect(parseReviewKeyAnimations([value])).toBeNull();
  expect(parseReviewKeyAnimations([keys[0], keys[0]])).toBeNull();
  const source = { duration: 10, width: 1920, height: 1080, mimeType: 'video/mp4', size: 1 };
  const history = [{ id: 'op', at: 1, target: 'advancedContent' as const, before, after }];
  expect(replayReviewHistory(history, 1, source).advancedContent.keyAnimations).toEqual(keys);
  expect(replayReviewHistory(history, 0, source).advancedContent.keyAnimations).toBeUndefined();
});
it('bulk style edits preserve unrelated per-command values', () => {
  const initial = patchReviewKeys([], ['a'], {
    enabled: true,
    style: { color: '#ff0000', position: 'top-right' },
  });
  const next = patchReviewKeys(initial, ['a', 'b'], { style: { fontSize: 32 } });
  expect(next[0]!.style).toMatchObject({ color: '#ff0000', position: 'top-right', fontSize: 32 });
  expect(next[1]!.style.position).toBe('bottom-center');
  expect(initial[0]!.style.fontSize).toBe(24);
});
it('schedules commands without points, in result time and bounded by cuts', () => {
  const segments = buildReviewTimeMap(8, [
    {
      id: 's',
      kind: 'speed',
      start: 0,
      end: 4,
      requestedStart: 0,
      requestedEnd: 4,
      rate: 2,
      audio: 'mute',
    },
    { id: 'c', kind: 'cut', start: 4, end: 5, requestedStart: 4, requestedEnd: 5 },
  ]);
  const markers = [
    {
      ref: { kind: 'action' as const, id: 'key' },
      eventType: 'KEY',
      target: 'Ctrl+C',
      start: 3,
      end: 3.55,
    },
  ];
  const settings = patchReviewKeys([], ['key'], {
    enabled: true,
    before: 0.2,
    after: 2,
    offset: -0.1,
  });
  expect(scheduleReviewKeys(markers, settings, segments)).toMatchObject([
    { label: 'Ctrl+C', start: 1.2, end: 2 },
  ]);
  expect(scheduleReviewKeys([{ ...markers[0]!, start: 4.5 }], settings, segments)).toEqual([]);
});
it('requires rendered video for enabled advanced captions, but preserves basic copy export', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.keyAnimations = patchReviewKeys([], ['key'], { enabled: true });
  advanced.ui.mode = 'advanced';
  const args = { advanced, document: { edits: [], canvasComments: [] } };
  expect(resolveQuickEditExportPlan(args)).toMatchObject({
    video: 'render',
    reasons: ['key-animations'],
  });
  advanced.ui.mode = 'basic';
  expect(resolveQuickEditExportPlan(args)).toMatchObject({ video: 'copy' });
});

it.each(['KEY_HOLD', 'KEY_MODIFIERS'])(
  'keeps %s command captions eligible after semantic projection',
  (eventType) => {
    const marker = {
      ref: { kind: 'action' as const, id: 'command' },
      eventType,
      target: 'Ctrl+Shift',
      start: 1,
      end: 2,
    };
    const settings = patchReviewKeys([], ['command'], { enabled: true, before: 0, after: 0.5 });
    expect(scheduleReviewKeys([marker], settings, buildReviewTimeMap(4, []))).toMatchObject([
      { label: 'Ctrl+Shift', start: 1, end: 1.5 },
    ]);
  }
);
