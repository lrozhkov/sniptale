import { expect, it } from 'vitest';
import type {
  ReviewTextFragment,
  ReviewVoiceTextSnapshot,
} from '../../features/video/review/text-document';
import { queryReviewText, type ReviewTextFilters } from './use-review-text';

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
  expect(
    queryReviewText(
      [manual, original, voiceover],
      [],
      { ...all, origin: 'original', visibility: 'hidden' },
      [manual.id, original.id]
    ).eligible
  ).toEqual([original.id]);
  expect(
    queryReviewText([manual, original, voiceover], [], { ...all, origin: 'manual' }, []).found
  ).toEqual([manual]);
});
