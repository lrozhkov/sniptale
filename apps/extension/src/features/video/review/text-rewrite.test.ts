import { describe, expect, it } from 'vitest';
import type { ReviewTextContext } from '../../../contracts/ai/review-text';
import {
  applyReviewTextRewrite,
  matchesReviewTextRewriteBasis,
  type ReviewTextRewriteBasis,
} from './text-rewrite';
import {
  mergeReviewTextFragments,
  reviewVoiceTextStatus,
  splitReviewTextFragment,
  type ReviewTextDocument,
  type ReviewTextFragment,
} from './text-document';
import { parseReviewTextDocument } from './text-validation';

const one: ReviewTextFragment = {
  id: 'one',
  text: 'First',
  originalText: 'First',
  start: 1,
  end: 2,
  timeDomain: 'source',
  revision: 1,
  timingRevision: 2,
  showInVideo: true,
  alignment: 'word',
  words: [{ text: 'First', start: 1, end: 2 }],
  origin: { kind: 'original', start: 1, end: 2, words: [{ text: 'First', start: 1, end: 2 }] },
};
const two: ReviewTextFragment = {
  ...one,
  id: 'two',
  text: 'Second',
  originalText: 'Second',
  start: 6,
  end: 8,
  timeDomain: 'result',
  words: [{ text: 'Second', start: 6, end: 8 }],
  origin: {
    kind: 'voiceover',
    clipId: 'voice',
    start: 0,
    end: 2,
    words: [{ text: 'Second', start: 0, end: 2 }],
  },
};
const document: ReviewTextDocument = { version: 1, fragments: [one, two] };
const context: ReviewTextContext = {
  version: 1,
  prompt: 'Shorten',
  mode: 'phrases',
  wholeDocument: true,
  changeIntervals: false,
  resegment: false,
  window: { start: 1, end: 8 },
  fragments: [one, two].map(({ id, text, start, end }) => ({ id, text, start, end })),
};
const basis: ReviewTextRewriteBasis = { context, fragments: structuredClone(document.fragments) };
const proposal = {
  version: 1 as const,
  fragments: [
    { fromIds: ['one'], text: 'A' },
    { fromIds: ['two'], text: 'B' },
  ],
};
function ids() {
  let count = 0;
  return () => `new-${++count}`;
}

describe('AI text proposal application', () => {
  it('preserves IDs, native clocks, pauses and provenance while invalidating only changed alignment', () => {
    const result = applyReviewTextRewrite(document, basis, proposal, 'replace', ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.fragments[0]).toMatchObject({
      id: 'one',
      start: 1,
      end: 2,
      timeDomain: 'source',
      revision: 2,
      timingRevision: 2,
      alignment: 'manual',
      origin: one.origin,
    });
    expect(result.document.fragments[0]?.words).toBeUndefined();
    expect(result.document.fragments[1]).toMatchObject({ start: 6, end: 8, origin: two.origin });
    expect(document.fragments[0]).toEqual(one);
    const snapshot = { ...one, kind: 'microphone' as const, textId: one.id };
    expect(reviewVoiceTextStatus(result.document.fragments[0], snapshot)).toBe('text-changed');
  });
  it('keeps exact word timing and revisions on a no-op and preserves independent appearance edits', () => {
    const current = {
      ...document,
      fragments: document.fragments.map((entry) => ({ ...entry, showInVideo: false })),
    };
    const unchanged = {
      version: 1 as const,
      fragments: document.fragments.map((entry) => ({ fromIds: [entry.id], text: entry.text })),
    };
    const result = applyReviewTextRewrite(current, basis, unchanged, 'replace', ids());
    expect(result).toEqual({ ok: true, document: current, changed: false });
  });
  it('preserves identities and take associations on an unchanged permitted structural proposal', () => {
    const current = { ...document, fragments: [{ ...one, timeDomain: 'result' as const }, two] };
    const permitted = {
      fragments: structuredClone(current.fragments),
      context: { ...context, mode: 'script' as const, changeIntervals: true, resegment: true },
    };
    const createId = () => {
      throw new Error('no-op must not create identities');
    };
    const result = applyReviewTextRewrite(
      current,
      permitted,
      {
        version: 1,
        fragments: current.fragments.map(({ id, text, start, end }) => ({
          fromIds: [id],
          text,
          start,
          end,
        })),
      },
      'replace',
      createId
    );
    expect(result).toEqual({ ok: true, document: current, changed: false });
    if (!result.ok) return;
    expect(result.document).toBe(current);
    expect(
      reviewVoiceTextStatus(result.document.fragments[0], {
        ...one,
        kind: 'microphone',
        textId: one.id,
        timeDomain: 'result',
      })
    ).toBe('current');
  });
  it.each([
    { text: 'changed' },
    { revision: 2 },
    { timingRevision: 3 },
    { start: 0 },
    { timeDomain: 'result' as const },
    { language: 'ru' },
  ])('refuses stale content, revisions, clock, placement or language', (patch) => {
    const current = { ...document, fragments: [{ ...one, ...patch }, two] };
    expect(applyReviewTextRewrite(current, basis, proposal, 'replace', ids())).toEqual({
      ok: false,
      reason: 'stale',
    });
  });
  it('distinguishes explicit full scope from a selection and rejects newly added full-document fragments', () => {
    expect(
      matchesReviewTextRewriteBasis(
        { ...document, fragments: [...document.fragments, { ...two, id: 'extra' }] },
        basis
      )
    ).toBe(false);
    const selected: ReviewTextRewriteBasis = {
      fragments: [one],
      context: { ...context, wholeDocument: false, fragments: [context.fragments[0]!] },
    };
    expect(matchesReviewTextRewriteBasis(document, selected)).toBe(true);
    expect(
      matchesReviewTextRewriteBasis(document, {
        ...selected,
        context: { ...selected.context, resegment: true },
      })
    ).toBe(false);
  });
  it('requires timing permission and stores explicit intervals in result time no pretending n...', () => {
    const permitted = { ...basis, context: { ...context, changeIntervals: true } };
    const timed = {
      version: 1 as const,
      fragments: [
        { fromIds: ['one'], text: one.text, start: 1, end: 2 },
        { fromIds: ['two'], text: two.text, start: 6, end: 8 },
      ],
    };
    expect(applyReviewTextRewrite(document, basis, timed, 'replace', ids()).ok).toBe(false);
    const result = applyReviewTextRewrite(document, permitted, timed, 'replace', ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.fragments[0]).toMatchObject({
      timeDomain: 'result',
      timingRevision: 3,
      revision: 1,
      origin: one.origin,
      alignment: 'manual',
    });
    expect(result.document.fragments[0]?.words).toBeUndefined();
    expect(result.document.fragments[1]).toEqual(two);
  });
  it('creates local identities and complete mixed provenance on explicit script restructuring', () => {
    const permitted = {
      ...basis,
      context: { ...context, mode: 'script' as const, changeIntervals: true, resegment: true },
    };
    const result = applyReviewTextRewrite(
      document,
      permitted,
      { version: 1, fragments: [{ fromIds: ['one', 'two'], text: 'A and B', start: 1, end: 8 }] },
      'replace',
      ids()
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.fragments).toHaveLength(1);
    const rewritten = result.document.fragments[0]!;
    expect(rewritten).toMatchObject({
      id: 'new-1',
      alignment: 'manual',
      timeDomain: 'result',
      derivedFrom: ['one', 'two'],
      origins: [one.origin, two.origin],
    });
    expect(rewritten.origin).toBeUndefined();
    expect(rewritten.words).toBeUndefined();
    const split = splitReviewTextFragment(result.document, rewritten.id, {
      id: 'split',
      position: 2,
      time: 4,
    });
    expect(split.ok).toBe(true);
    if (split.ok)
      expect(
        split.document.fragments.every(
          (entry) => JSON.stringify(entry.origins) === JSON.stringify(rewritten.origins)
        )
      ).toBe(true);
  });
  it('creates a hidden alternative with original content untouched, refusing ID collisions', () => {
    const result = applyReviewTextRewrite(document, basis, proposal, 'variant', ids());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.fragments.slice(0, 2)).toEqual(document.fragments);
    expect(
      result.document.fragments
        .slice(2)
        .map((entry) => [entry.id, entry.variantId, entry.showInVideo])
    ).toEqual([
      ['new-2', 'new-1', false],
      ['new-3', 'new-1', false],
    ]);
    expect(applyReviewTextRewrite(document, basis, proposal, 'variant', () => 'one')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
  it('refuses malformed multi-origin records and never silently drops their words or merges differing sources', () => {
    const { origin: _firstOrigin, ...first } = one;
    const { origin: _secondOrigin, ...second } = two;
    const multi = { ...first, origins: [one.origin!, two.origin!] };
    expect(
      parseReviewTextDocument({ version: 1, fragments: [multi] })?.fragments[0]?.origins
    ).toEqual(multi.origins);
    expect(
      parseReviewTextDocument({ version: 1, fragments: [{ ...multi, origin: one.origin }] })
    ).toBeNull();
    expect(
      parseReviewTextDocument({
        version: 1,
        fragments: [{ ...multi, origins: [one.origin, one.origin] }],
      })
    ).toBeNull();
    expect(
      parseReviewTextDocument({
        version: 1,
        fragments: [{ ...multi, origins: [{ ...one.origin, end: 0 }] }],
      })
    ).toBeNull();
    expect(
      mergeReviewTextFragments(
        { version: 1, fragments: [multi, { ...second, start: 2, origins: [two.origin!] }] },
        'one',
        'two'
      ).ok
    ).toBe(false);
    const origins = Array.from({ length: 11 }, (_, index) => ({
      kind: 'original' as const,
      start: index * 4_000,
      end: (index + 1) * 4_000,
      words: Array.from({ length: 4_000 }, (_, word) => ({
        text: 'a',
        start: index * 4_000 + word,
        end: index * 4_000 + word + 1,
      })),
    }));
    expect(parseReviewTextDocument({ version: 1, fragments: [{ ...multi, origins }] })).toBeNull();
  });
});
