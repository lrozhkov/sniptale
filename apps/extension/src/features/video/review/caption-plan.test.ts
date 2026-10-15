import { expect, it, vi } from 'vitest';
import { createReviewCaptionSettings, reviewVoiceTextStatus } from './text-document';
import type { ReviewTextFragment } from './text-types';
import { buildReviewTimeMap } from './timeline';
import { planReviewCaptions, reviewCaptionsAt } from './caption-plan';

const settings = { ...createReviewCaptionSettings(), enabled: true };
const measure = (text: string, pixels: number) => Array.from(text).length * pixels * 0.5;
function phrase(id: string, start: number, end: number, text = 'Caption'): ReviewTextFragment {
  return {
    id,
    start,
    end,
    text,
    originalText: text,
    timeDomain: 'result',
    revision: 0,
    timingRevision: 0,
    alignment: 'manual',
    showInVideo: true,
  };
}
function plan(fragments: ReviewTextFragment[], output = { width: 640, height: 360 }) {
  return planReviewCaptions({
    document: { version: 1, fragments },
    settings,
    segments: buildReviewTimeMap(20, []),
    output,
    measure,
  });
}
it.each([
  { width: 640, height: 360 },
  { width: 360, height: 640 },
  { width: 401, height: 401 },
])(
  'reserves two lines and a permanent baseline across sequential captions in each aspect ratio',
  (output) => {
    const cues = plan(
      [phrase('one', 0, 2, 'One'), phrase('two', 2, 4, 'First line\nSecond line')],
      output
    );
    expect(cues.conflicts).toEqual([]);
    expect(cues.cues[0]?.height).toBe(cues.cues[1]?.height);
    expect(cues.cues[0]?.y).toBe(cues.cues[1]?.y);
  }
);
it('preallocates connected overlap slots and keeps surviving cues fixed across forward/backward seeks', () => {
  const result = plan([phrase('a', 0, 2), phrase('b', 1, 5), phrase('c', 4, 6)]);
  expect(result.conflicts).toEqual([]);
  const before = reviewCaptionsAt(result, 1.5).find((cue) => cue.fragmentId === 'b');
  expect(reviewCaptionsAt(result, 3).find((cue) => cue.fragmentId === 'b')).toBe(before);
  expect(reviewCaptionsAt(result, 4.5).find((cue) => cue.fragmentId === 'b')).toBe(before);
  expect(reviewCaptionsAt(result, 1.5).find((cue) => cue.fragmentId === 'b')).toBe(before);
  expect(before!.y).toBeLessThan(result.cues.find((cue) => cue.fragmentId === 'a')!.y);
});
it('uses source retained slices and output clocks across Cut and Speed without filling removed spans', () => {
  const source = { ...phrase('source', 1, 9), timeDomain: 'source' as const };
  const result = planReviewCaptions({
    document: { version: 1, fragments: [source, phrase('output', 1, 3)] },
    settings,
    output: { width: 640, height: 360 },
    measure,
    segments: buildReviewTimeMap(10, [
      { id: 'cut', kind: 'cut', start: 3, end: 5, requestedStart: 3, requestedEnd: 5 },
      {
        id: 'speed',
        kind: 'speed',
        start: 5,
        end: 9,
        requestedStart: 5,
        requestedEnd: 9,
        rate: 2,
        audio: 'speed',
      },
    ]),
  });
  expect(
    result.cues.filter((cue) => cue.fragmentId === 'source').map(({ start, end }) => [start, end])
  ).toEqual([
    [1, 3],
    [3, 5],
  ]);
  expect(result.cues.find((cue) => cue.fragmentId === 'output')).toMatchObject({
    start: 1,
    end: 3,
  });
});
it('displays complete manual text and subdivides only verified current word alignment', () => {
  const text = Array.from({ length: 40 }, (_, index) => `word${index}`).join(' ');
  const manual = phrase('manual', 0, 10, text);
  const word = {
    ...manual,
    id: 'word',
    alignment: 'word' as const,
    words: text.split(' ').map((text, index) => ({ text, start: index / 4, end: (index + 1) / 4 })),
  };
  const result = plan([word]);
  expect(result.cues.length).toBeGreaterThan(1);
  expect(result.cues.every((cue) => cue.lines.length <= 2)).toBe(true);
  expect(
    result.cues
      .flatMap((cue) => cue.lines)
      .join(' ')
      .replace(/\s/gu, '')
  ).toBe(text.replace(/\s/gu, ''));
  const unchanged = structuredClone(word);
  const snapshot = { ...word, kind: 'microphone' as const, textId: word.id };
  expect(reviewVoiceTextStatus(word, snapshot)).toBe('current');
  expect(word).toEqual(unchanged);
  expect(plan([manual]).cues).toHaveLength(1);
  expect(plan([{ ...word, text: `Changed ${text}` }]).cues).toHaveLength(1);
});
it('uses local appearance and ignores globally disabled, hidden, empty and excluded captions', () => {
  const local = {
    ...phrase('local', 0, 2),
    style: { ...settings.style, position: 'top' as const },
  };
  expect(plan([local]).cues[0]?.y).toBe(18);
  const spy = vi.fn(measure);
  expect(
    planReviewCaptions({
      document: { version: 1, fragments: [local] },
      settings: { ...settings, enabled: false },
      segments: [],
      output: { width: 640, height: 360 },
      measure: spy,
    })
  ).toEqual({ cues: [], conflicts: [] });
  expect(spy).not.toHaveBeenCalled();
  expect(
    plan([{ ...local, showInVideo: false }, phrase('empty', 0, 2, ''), phrase('excluded', 25, 30)])
      .cues
  ).toEqual([]);
});
it('reports unsafe full-text and overlay reservations with affected phrase identities', () => {
  const oversized = plan([phrase('long', 0, 3, 'text '.repeat(500))]);
  expect(oversized.conflicts).toContainEqual(
    expect.objectContaining({ fragmentId: 'long', reason: 'space' })
  );
  expect(oversized.cues[0]!.lines.join('').replace(/\s/gu, '')).toBe('text'.repeat(500));
  const result = planReviewCaptions({
    document: { version: 1, fragments: [phrase('one', 0, 2)] },
    settings,
    output: { width: 640, height: 360 },
    segments: buildReviewTimeMap(20, []),
    measure,
    reservations: [{ x: 0, y: 300, width: 640, height: 60, start: 0, end: 2, conservative: true }],
  });
  expect(result.conflicts).toContainEqual({
    fragmentId: 'one',
    reason: 'overlay',
    conservative: true,
    start: 0,
    end: 2,
  });
});
it('bounds pathological simultaneous slots without dropping authored cue text', () => {
  const result = plan(Array.from({ length: 200 }, (_, index) => phrase(`phrase-${index}`, 0, 2)));
  expect(result.cues).toHaveLength(200);
  expect(result.conflicts.some((entry) => entry.reason === 'budget')).toBe(true);
  expect(result.conflicts.filter((entry) => entry.reason === 'space').length).toBeGreaterThan(180);
});

it('stops oversized cue expansion and refuses it explicitly while retaining every affected fragment identity', () => {
  const fragments = Array.from({ length: 1250 }, (_, index) => ({
    ...phrase(`phrase-${index}`, 0, 34),
    timeDomain: 'source' as const,
  }));
  const segments = Array.from({ length: 34 }, (_, index) => ({
    sourceStart: index,
    sourceEnd: index + 1,
    resultStart: Math.ceil(index / 2),
    resultEnd: Math.ceil(index / 2) + (index % 2 ? 0 : 1),
    kind: index % 2 ? ('cut' as const) : ('keep' as const),
    rate: 1,
  }));
  const measureSpy = vi.fn(measure);
  const result = planReviewCaptions({
    document: { version: 1, fragments },
    settings,
    segments,
    output: { width: 640, height: 360 },
    measure: measureSpy,
  });
  expect(result.cues).toHaveLength(20_000);
  const affected = new Set([
    ...result.cues.map((cue) => cue.fragmentId),
    ...result.conflicts.map((entry) => entry.fragmentId),
  ]);
  expect(affected.size).toBe(fragments.length);
  expect(result.conflicts).toContainEqual(
    expect.objectContaining({ fragmentId: 'phrase-1249', reason: 'budget' })
  );
  expect(measureSpy.mock.calls.length).toBeLessThan(10_000);
});
