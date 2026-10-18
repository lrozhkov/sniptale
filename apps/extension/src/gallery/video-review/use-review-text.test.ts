import { expect, it } from 'vitest';
import type {
  ReviewTextFragment,
  ReviewVoiceTextSnapshot,
} from '../../features/video/review/text-document';
import { createTrackProjection } from './track-projection';
import {
  reviewTextRecordingMaximum,
  queryReviewText,
  type ReviewTextFilters,
} from './use-review-text';

const all: ReviewTextFilters = { query: '', origin: 'all', voice: 'all', visibility: 'all' };
const fragment = (index: number): ReviewTextFragment => ({
  id: `text-${index}`,
  start: index * 4,
  end: index * 4 + 3,
  text: `Урок ${index}`,
  originalText: '',
  revision: 0,
  timingRevision: 0,
  timeDomain: 'result',
  alignment: 'manual',
  showInVideo: true,
});
const snapshot = (text: ReviewTextFragment): ReviewVoiceTextSnapshot => ({
  kind: 'microphone',
  textId: text.id,
  text: text.text,
  revision: text.revision,
  timingRevision: text.timingRevision,
  timeDomain: text.timeDomain,
  start: text.start,
  end: text.end,
});

it('keeps selection beyond the first render page and excludes hidden selection from batch', () => {
  const fragments = Array.from({ length: 120 }, (_, index) => fragment(index));
  const selected = fragments.map((entry) => entry.id);
  const complete = queryReviewText(fragments, [], all, selected);
  expect(complete.eligible).toHaveLength(120);
  expect(complete.eligible).toContain('text-119');
  const filtered = queryReviewText(fragments, [], { ...all, query: 'УРОК 119' }, [
    ...selected,
    'deleted',
  ]);
  expect(filtered.eligible).toEqual(['text-119']);
  expect(filtered.hidden).toBe(119);
  expect(selected).toHaveLength(120);
});

it('distinguishes current and changed voice takes and does not lose alternative takes', () => {
  const text = fragment(0);
  const other = fragment(1);
  const current = snapshot(text);
  const changed = { ...current, revision: 1 };
  const snapshots = [current, changed, { ...snapshot(other), timingRevision: 3 }];
  expect(
    queryReviewText([text, other, fragment(2)], snapshots, { ...all, voice: 'current' }, []).found
  ).toEqual([text]);
  expect(
    queryReviewText([text, other, fragment(2)], snapshots, { ...all, voice: 'changed' }, []).found
  ).toEqual([text, other]);
  expect(
    queryReviewText([text, other, fragment(2)], snapshots, { ...all, voice: 'none' }, []).found.map(
      (entry) => entry.id
    )
  ).toEqual(['text-2']);
});

it('filters provenance and visibility independently of text and audio ownership', () => {
  const manual = fragment(0);
  const original = {
    ...fragment(1),
    origin: { kind: 'original' as const, start: 0, end: 3 },
    showInVideo: false,
  };
  const voiceover = {
    ...fragment(2),
    origin: { kind: 'voiceover' as const, clipId: 'source', start: 0, end: 3 },
  };
  const mixed = { ...fragment(3), origins: [original.origin, voiceover.origin] };
  expect(
    queryReviewText(
      [manual, original, voiceover],
      [],
      { ...all, origin: 'original', visibility: 'hidden' },
      [manual.id, original.id]
    ).eligible
  ).toEqual([original.id]);
  expect(
    queryReviewText([manual, original, voiceover, mixed], [], { ...all, origin: 'manual' }, [])
      .found
  ).toEqual([manual]);
  for (const origin of ['original', 'voiceover'] as const) {
    expect(queryReviewText([mixed], [], { ...all, origin }, [mixed.id]).eligible).toEqual([
      mixed.id,
    ]);
  }
});

it('uses optimistic result and source placement for the display cap across cuts and rates', () => {
  const projection = createTrackProjection(12, [
    { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
    {
      id: 'speed',
      kind: 'speed',
      start: 6,
      end: 10,
      requestedStart: 6,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const editor = {
    projection,
    document: {
      version: 1 as const,
      fragments: [
        { ...fragment(0), id: 'result', start: 1, end: 2 },
        { ...fragment(0), id: 'source', timeDomain: 'source' as const, start: 8, end: 9 },
        { ...fragment(0), id: 'past', start: 20, end: 21 },
      ],
    },
  };
  expect(projection.resultDuration).toBe(8);
  expect(reviewTextRecordingMaximum(editor, 'result')).toBe(7);
  expect(reviewTextRecordingMaximum(editor, 'source')).toBe(3);
  expect(reviewTextRecordingMaximum(editor, 'past')).toBe(0);
  expect(reviewTextRecordingMaximum(editor, 'missing')).toBe(0);
  expect(reviewTextRecordingMaximum(editor, undefined)).toBe(0);
});
