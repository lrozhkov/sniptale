import { describe, expect, it } from 'vitest';
import {
  addReviewTextFragment,
  createReviewCaptionSettings,
  createReviewTextDocument,
  deleteReviewTextFragments,
  editReviewTextFragment,
  mergeReviewTextFragments,
  reviewTextSplitBoundary,
  reviewVoiceTextStatus,
  splitReviewTextFragment,
} from './text-document';
import type {
  ReviewTextDocument,
  ReviewTextFragment,
  ReviewVoiceTextSnapshot,
} from './text-document';

function fragment(patch: Partial<ReviewTextFragment> = {}): ReviewTextFragment {
  return {
    id: 'one',
    start: 1,
    end: 6,
    text: 'One two',
    originalText: 'One two',
    revision: 0,
    timingRevision: 0,
    timeDomain: 'source',
    showInVideo: true,
    alignment: 'word',
    words: [
      { text: 'One', start: 1, end: 2 },
      { text: 'two', start: 5, end: 6 },
    ],
    origin: {
      kind: 'original',
      start: 1,
      end: 6,
      words: [
        { text: 'One', start: 1, end: 2 },
        { text: 'two', start: 5, end: 6 },
      ],
    },
    ...patch,
  };
}
function document(value = fragment()): ReviewTextDocument {
  return { version: 1, fragments: [value] };
}
function snapshot(value = fragment()): ReviewVoiceTextSnapshot {
  return {
    kind: 'microphone',
    textId: value.id,
    text: value.text,
    revision: value.revision,
    timingRevision: value.timingRevision,
    timeDomain: value.timeDomain,
    start: value.start,
    end: value.end,
  };
}

describe('standalone authored text', () => {
  it('creates empty text on silent video and permits real overlaps without an audio asset', () => {
    const first = addReviewTextFragment(createReviewTextDocument(), {
      id: 'one',
      start: 1,
      end: 4,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addReviewTextFragment(first.document, {
      id: 'two',
      start: 2,
      end: 5,
      text: 'Hello',
    });
    expect(second.ok && second.document.fragments).toHaveLength(2);
    expect(first.document.fragments[0]).toMatchObject({
      text: '',
      alignment: 'manual',
      timeDomain: 'result',
    });
    expect(createReviewCaptionSettings().enabled).toBe(false);
  });

  it('counts text and timing changes separately and retains native provenance after edits', () => {
    const original = document();
    const take = snapshot();
    const edited = editReviewTextFragment(original, 'one', { text: 'Changed' });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const text = edited.document.fragments[0]!;
    expect(text).toMatchObject({
      revision: 1,
      timingRevision: 0,
      alignment: 'manual',
      origin: original.fragments[0]!.origin,
    });
    expect(text.words).toBeUndefined();
    expect(reviewVoiceTextStatus(text, take)).toBe('text-changed');
    expect(original.fragments[0]!.text).toBe('One two');
    const moved = editReviewTextFragment(original, 'one', { start: 0.5 });
    expect(moved.ok && moved.document.fragments[0]).toMatchObject({
      revision: 0,
      timingRevision: 1,
    });
    expect(moved.ok && reviewVoiceTextStatus(moved.document.fragments[0], take)).toBe(
      'timing-changed'
    );
  });

  it('keeps ready audio valid through style, visibility and no-op changes', () => {
    const current = fragment();
    const take = snapshot(current);
    const next = editReviewTextFragment(document(current), 'one', {
      text: current.text,
      start: current.start,
      showInVideo: false,
      style: createReviewCaptionSettings().style,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(reviewVoiceTextStatus(next.document.fragments[0], take)).toBe('current');
    expect(next.document.fragments[0]!.words).toEqual(current.words);
    const inherit = editReviewTextFragment(next.document, 'one', { style: null });
    expect(inherit.ok && inherit.document.fragments[0]!.style).toBeUndefined();
    expect(deleteReviewTextFragments(next.document, ['one']).fragments).toEqual([]);
    expect(take.text).toBe('One two');
    expect(reviewVoiceTextStatus(undefined, take)).toBe('unlinked');
  });

  it('splits at word timing preserving a three-second pause, origin and local styling', () => {
    const style = createReviewCaptionSettings().style;
    const current = fragment({ style, showInVideo: false });
    expect(reviewTextSplitBoundary(current, 2)).toBeNull();
    const split = splitReviewTextFragment(document(current), 'one', { id: 'two', position: 4 });
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.document.fragments.map((entry) => [entry.start, entry.end])).toEqual([
      [1, 2],
      [5, 6],
    ]);
    expect(split.document.fragments.map((entry) => entry.text)).toEqual(['One', 'two']);
    for (const entry of split.document.fragments) {
      expect(entry.origin).toEqual(current.origin);
      expect(entry.style).toEqual(style);
      expect(entry.showInVideo).toBe(false);
    }
    expect(mergeReviewTextFragments(split.document, 'one', 'two')).toEqual({
      ok: false,
      reason: 'gap',
    });
  });

  it('requires an explicit time after manual edits and does not manufacture an aligned midpoint', () => {
    const edited = editReviewTextFragment(document(), 'one', { text: 'New words' });
    if (!edited.ok) throw new Error('fixture');
    expect(splitReviewTextFragment(edited.document, 'one', { id: 'two', position: 4 })).toEqual({
      ok: false,
      reason: 'alignment',
    });
    const split = splitReviewTextFragment(edited.document, 'one', {
      id: 'two',
      position: 4,
      time: 3,
    });
    expect(split.ok && split.document.fragments.map((entry) => [entry.start, entry.end])).toEqual([
      [1, 3],
      [3, 6],
    ]);
    expect(
      splitReviewTextFragment(edited.document, 'one', { id: 'two', position: 4, time: 8 }).ok
    ).toBe(false);
  });

  it('rejects stale, duplicate, invalid and unbounded mutations before publication', () => {
    expect(editReviewTextFragment(document(), 'missing', { text: 'x' })).toEqual({
      ok: false,
      reason: 'stale',
    });
    expect(addReviewTextFragment(document(), { id: 'one', start: 0, end: 1 }).ok).toBe(false);
    expect(editReviewTextFragment(document(), 'one', { end: Infinity }).ok).toBe(false);
    expect(editReviewTextFragment(document(), 'one', { text: 'x'.repeat(16_001) }).ok).toBe(false);
    expect(
      editReviewTextFragment(document(), 'one', {
        style: { ...createReviewCaptionSettings().style, fontSize: 10 },
      }).ok
    ).toBe(false);
  });

  it('merges touching compatible text and refuses different clocks or styles', () => {
    const first = fragment({ id: 'one', end: 3, text: 'One', alignment: 'manual' });
    const second = fragment({ id: 'two', start: 3, text: 'two', alignment: 'manual' });
    delete first.words;
    delete first.origin;
    delete second.words;
    delete second.origin;
    const both: ReviewTextDocument = { version: 1, fragments: [first, second] };
    const merged = mergeReviewTextFragments(both, 'one', 'two');
    expect(merged.ok && merged.document.fragments[0]).toMatchObject({
      text: 'One two',
      start: 1,
      end: 6,
      derivedFrom: ['one', 'two'],
    });
    expect(
      mergeReviewTextFragments(
        { ...both, fragments: [first, { ...second, timeDomain: 'result' }] },
        'one',
        'two'
      ).ok
    ).toBe(false);
    expect(
      mergeReviewTextFragments(
        { ...both, fragments: [first, { ...second, showInVideo: false }] },
        'one',
        'two'
      ).ok
    ).toBe(false);
  });
});
