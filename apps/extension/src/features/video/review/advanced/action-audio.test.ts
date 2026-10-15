import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState, loadQuickEditAdvancedContentState } from './validation';
import { replayReviewHistory, reviewAdvancedContentBaseline } from '../document';
import {
  parseReviewActionAudio,
  patchReviewActionAudio,
  reviewActionAudioRefKey,
  type ReviewActionAudioSetting,
  type ReviewActionAudioTarget,
} from './action-audio';

it('retains action sounds through admission, baseline and Undo/Redo without creating audio clips', () => {
  const state = createQuickEditAdvancedState();
  const actionAudio = [
    {
      ref: { kind: 'action', id: 'click' },
      enabled: true,
      presetId: 'mouse-classic-v1',
      volume: 0.35,
      offset: 0,
    },
  ];
  const parsed = loadQuickEditAdvancedState({ ...state, actionAudio });
  expect(parsed).toMatchObject({ actionAudio });
  if (!parsed) throw new Error('Invalid authored fixture');
  const before = reviewAdvancedContentBaseline(state);
  const after = reviewAdvancedContentBaseline(parsed);
  expect(loadQuickEditAdvancedContentState(after)).toMatchObject({ actionAudio });
  const source = { duration: 12, width: 160, height: 90, mimeType: 'video/webm', size: 100 };
  const history = [{ id: 'sounds', at: 1, target: 'advancedContent' as const, before, after }];
  expect(replayReviewHistory(history, 0, source).advancedContent).not.toHaveProperty('actionAudio');
  expect(replayReviewHistory(history, 1, source).advancedContent).toMatchObject({
    actionAudio,
    audio: { voiceover: [], music: [] },
  });
});

it('keeps missing legacy action-audio state absent without enabling or saving defaults', () => {
  const state = createQuickEditAdvancedState();
  expect(loadQuickEditAdvancedState(state)).not.toHaveProperty('actionAudio');
  expect(reviewAdvancedContentBaseline(state)).not.toHaveProperty('actionAudio');
});

const setting: ReviewActionAudioSetting = {
  ref: { kind: 'action', id: 'same' },
  enabled: false,
  presetId: null,
  volume: 0.35,
  offset: 0,
};
const targets: ReviewActionAudioTarget[] = [
  { ref: { kind: 'action', id: 'same' }, family: 'mouse' },
  { ref: { kind: 'action', id: 'key' }, family: 'keyboard' },
  { ref: { kind: 'signal', id: 'same' }, family: 'typing' },
];

it('uses a compatible default on explicit enable of an unresolved preset from another family', () => {
  const dormant: ReviewActionAudioSetting = { ...setting, presetId: 'keyboard-v1' };
  expect(patchReviewActionAudio([dormant], [targets[0]!], { enabled: true })[0]).toMatchObject({
    enabled: true,
    presetId: 'mouse-classic-v1',
  });
  expect(patchReviewActionAudio([dormant], [targets[0]!], { volume: 0.4 })[0]).toMatchObject({
    enabled: false,
    presetId: 'keyboard-v1',
    volume: 0.4,
  });
});

it('admits exact typed identities and keeps unresolved references without inventing a source', () => {
  const values = [setting, { ...setting, ref: { kind: 'signal' as const, id: 'same' } }];
  expect(parseReviewActionAudio(values)).toEqual(values);
  expect(reviewActionAudioRefKey(values[0]!.ref)).not.toBe(reviewActionAudioRefKey(values[1]!.ref));
  expect(
    parseReviewActionAudio([{ ...setting, ref: { kind: 'action', id: 'missing-in-telemetry' } }])
  ).toHaveLength(1);
  expect(parseReviewActionAudio(undefined)).toBeUndefined();
  expect(parseReviewActionAudio([])).toEqual([]);
});

it.each([
  { ref: { kind: 'cursor', id: 'same' } },
  { ref: { kind: 'action', id: '' } },
  { ref: { kind: 'action', id: 'x'.repeat(257) } },
  { ref: { kind: 'action', id: 'same', extra: true } },
  { enabled: 1 },
  { enabled: true, presetId: null },
  { presetId: 'keyboard-v2' },
  { volume: -0.01 },
  { volume: 1.01 },
  { volume: NaN },
  { volume: Infinity },
  { volume: '0.35' },
  { offset: -2.01 },
  { offset: 2.01 },
  { offset: Infinity },
  { offset: null },
  { url: 'https://remote.invalid/sound.wav' },
  { seed: 1 },
  { text: 'private' },
])('refuses malformed/unknown authored fields %#', (patch) => {
  expect(parseReviewActionAudio([{ ...setting, ...patch }])).toBeNull();
});

it('bounds the complete settings array and rejects duplicated typed identities', () => {
  expect(parseReviewActionAudio(null)).toBeNull();
  expect(parseReviewActionAudio([setting, setting])).toBeNull();
  expect(
    parseReviewActionAudio(
      Array.from({ length: 10_001 }, (_, index) => ({
        ...setting,
        ref: { kind: 'action', id: String(index) },
      }))
    )
  ).toBeNull();
  expect(
    parseReviewActionAudio([
      { ...setting, volume: 0, offset: -2 },
      { ...setting, ref: { kind: 'signal', id: 'same' }, volume: 1, offset: 2 },
    ])
  ).toHaveLength(2);
});

it('patches one compatible batch with retained off settings and audio-only reset', () => {
  const enabled = patchReviewActionAudio([], targets, { enabled: true });
  expect(enabled.map((item) => item.presetId).sort()).toEqual([
    'keyboard-v1',
    'mouse-classic-v1',
    'typing-natural-v1',
  ]);
  const changed = patchReviewActionAudio(enabled, targets, { presetId: 'mouse-soft-v1' });
  expect(changed.find((item) => item.ref.kind === 'signal')?.presetId).toBe('typing-natural-v1');
  expect(changed.find((item) => item.ref.id === 'key')?.presetId).toBe('keyboard-v1');
  expect(
    changed.find((item) => item.ref.kind === 'action' && item.ref.id === 'same')?.presetId
  ).toBe('mouse-soft-v1');
  const off = patchReviewActionAudio(changed, targets, { enabled: false, volume: 0.5, offset: -1 });
  expect(off.every((item) => !item.enabled && item.volume === 0.5 && item.offset === -1)).toBe(
    true
  );
  expect(off.map((item) => item.presetId)).toEqual(changed.map((item) => item.presetId));
  const reset = patchReviewActionAudio(off, [targets[0]!], null);
  expect(reset).toHaveLength(2);
  expect(reset.find((item) => item.ref.kind === 'signal' && item.ref.id === 'same')).toBeDefined();
  expect(
    patchReviewActionAudio(enabled, [targets[0]!], { presetId: null }).find(
      (item) => item.ref.id === 'same' && item.ref.kind === 'action'
    )
  ).toMatchObject({ enabled: false, presetId: null });
  expect(patchReviewActionAudio(off, [], { volume: 0.2 })).toEqual(off);
  expect(() => patchReviewActionAudio(enabled, targets, { volume: 2 })).toThrow('invalid');
});
