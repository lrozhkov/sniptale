import { expect, it } from 'vitest';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import { loadQuickEditAdvancedContentState } from './advanced/validation';
import { applyReviewOperation, replayReviewHistory } from './document';
import { buildReviewTimeMap } from './timeline';
import { projectReviewTextFragment } from './text-projection';
import { reviewTextSourceInterval } from './text-timing';
import {
  anchorReviewVoiceover,
  anchorReviewVoiceoverAtSource,
  normalizeReviewVoiceoverTempo,
  projectReviewVoiceover,
} from './voiceover-edits';
import {
  editReviewTextFragment,
  reviewVoiceTextStatus,
  splitReviewTextFragment,
  mergeReviewTextFragments,
} from './text-document';
import { parseReviewTextDocument } from './text-validation';
import { parseReviewOperation } from './validation';
import { exportReviewSubtitles } from './subtitle-export';
import { planReviewCaptions } from './caption-plan';
import { createReviewCaptionSettings } from './text-document';
import type { QuickEditAudioClip } from './advanced/types';
import type { ReviewDocument, ReviewEdit, ReviewOperation } from './types';
import type { ReviewTextFragment, ReviewVoiceTextSnapshot } from './text-types';

const source = { duration: 30, width: 640, height: 360, mimeType: 'video/webm', size: 100 };
const initial = buildReviewTimeMap(source.duration, []);
const cut = (start: number, end: number): ReviewEdit => ({
  id: 'cut',
  kind: 'cut',
  start,
  end,
  requestedStart: start,
  requestedEnd: end,
});
const speed = (start: number, end: number, rate: 2 | 0.5 = 2): ReviewEdit => ({
  id: 'speed',
  kind: 'speed',
  start,
  end,
  requestedStart: start,
  requestedEnd: end,
  rate,
  audio: 'speed',
});
function phrase(timeDomain: 'result' | 'source' = 'result'): ReviewTextFragment {
  return {
    id: 'phrase',
    start: 8,
    end: 12,
    text: 'One two',
    originalText: 'One two',
    revision: 0,
    timingRevision: 0,
    timeDomain,
    showInVideo: true,
    alignment: 'word',
    words: [
      { text: 'One', start: 8, end: 9 },
      { text: 'two', start: 10, end: 12 },
    ],
  };
}
function baseline(fragment = phrase()): ReviewDocument {
  const content = createQuickEditAdvancedContent();
  content.text = { version: 1, fragments: [fragment] };
  return { annotations: [], canvasComments: [], edits: [], advancedContent: content };
}
function operation(before: ReviewEdit | null, after: ReviewEdit | null): ReviewOperation {
  const parsed = parseReviewOperation(
    {
      id: `operation:${JSON.stringify(before)}:${JSON.stringify(after)}`,
      at: 1,
      target: 'edit',
      before,
      after,
      preserveTextAnchors: true,
      preserveVoiceoverAnchors: true,
      normalizeVoiceoverTempo: true,
    },
    source.duration
  );
  if (!parsed) throw new Error('Invalid test operation');
  return parsed;
}
function clip(fragment: ReviewTextFragment): QuickEditAudioClip {
  return {
    id: 'take',
    assetId: 'take-asset',
    timelineStart: fragment.start,
    sourceOffset: 0,
    duration: fragment.end - fragment.start,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}

for (const domain of ['source', 'result'] as const) {
  for (const edit of [
    cut(1, 3),
    cut(9, 11),
    cut(7, 13),
    speed(1, 3),
    speed(8, 10),
    speed(8, 10, 0.5),
  ]) {
    const rate = edit.kind === 'speed' ? ` ${edit.rate}x` : '';
    it(`matches voiceover for ${domain}: ${edit.kind} ${edit.start}-${edit.end}${rate} and removal`, () => {
      const fragment = phrase(domain);
      const original = baseline(fragment);
      const change = operation(null, edit);
      const result = applyReviewOperation(original, change, source);
      const map = buildReviewTimeMap(source.duration, result.edits);
      const anchor =
        domain === 'source'
          ? anchorReviewVoiceoverAtSource(clip(fragment), initial)
          : anchorReviewVoiceover(clip(fragment), initial);
      const take = normalizeReviewVoiceoverTempo(anchor, null, edit);
      const expected = projectReviewVoiceover([take], map).map((slice) => ({
        start: slice.timelineStart,
        end: slice.timelineStart + slice.duration,
      }));
      const current = result.advancedContent.text!.fragments[0]!;
      expect(projectReviewTextFragment(current, map).ranges).toEqual(expected);
      expect(current.sourceAnchor!.duration).toBe(4);
      expect(current.text).toBe(fragment.text);
      expect(current.timingRevision).toBe(0);
      if (edit.end < 8)
        expect(reviewTextSourceInterval(current, map)).toEqual({ start: 8, end: 12 });
      const restored = applyReviewOperation(result, operation(edit, null), source);
      expect(
        projectReviewTextFragment(restored.advancedContent.text!.fragments[0]!, initial).ranges
      ).toEqual([{ start: 8, end: 12 }]);
      expect(restored.advancedContent.text!.fragments[0]!.words).toEqual(fragment.words);
      expect(original).toEqual(baseline(fragment));
      const reopened = loadQuickEditAdvancedContentState(
        JSON.parse(JSON.stringify(result.advancedContent))
      );
      expect(reopened).toEqual(result.advancedContent);
      expect(replayReviewHistory([change], 0, source, original)).toEqual(original);
      expect(replayReviewHistory([change], 1, source, original)).toEqual(result);
    });
  }
}

it('preserves native duration on repeated Speed updates and leaves other phrases in place', () => {
  let document = baseline();
  const later = { ...phrase(), id: 'later', start: 20, end: 24 };
  delete later.words;
  document.advancedContent.text!.fragments.push(later);
  for (const [before, after] of [
    [null, speed(8, 10)],
    [speed(8, 10), speed(8, 14, 0.5)],
    [speed(8, 14, 0.5), null],
  ] as const) {
    document = applyReviewOperation(document, operation(before, after), source);
    const map = buildReviewTimeMap(source.duration, document.edits);
    for (const fragment of document.advancedContent.text!.fragments) {
      const ranges = projectReviewTextFragment(fragment, map).ranges;
      expect(ranges.reduce((sum, range) => sum + range.end - range.start, 0)).toBeCloseTo(4, 7);
    }
    expect(reviewTextSourceInterval(document.advancedContent.text!.fragments[1]!, map)).toEqual({
      start: 20,
      end: 24,
    });
  }
});

it('uses current projected ranges for captions and downloaded subtitles', () => {
  const document = applyReviewOperation(baseline(), operation(null, cut(1, 3)), source);
  const segments = buildReviewTimeMap(source.duration, document.edits);
  const fragment = document.advancedContent.text!.fragments[0]!;
  const settings = { ...createReviewCaptionSettings(), enabled: true };
  expect(
    planReviewCaptions({
      document: document.advancedContent.text,
      settings,
      segments,
      output: { width: 1280, height: 720 },
      measure: (text) => text.length * 10,
    }).cues.map(({ start, end }) => ({ start, end }))
  ).toEqual([{ start: 6, end: 10 }]);
  const exported = exportReviewSubtitles({
    fragments: [fragment],
    segments,
    ids: [fragment.id],
    format: 'vtt',
    language: null,
    onlyShown: true,
    normalizeOverlaps: false,
    mainOffset: 0,
  });
  expect(exported.ok && exported.text).toContain('00:00:06.000 --> 00:00:10.000');
});

it('keeps accepted voice snapshots current across implicit timing changes and detects explicit moves', () => {
  const original = phrase();
  const snapshot: ReviewVoiceTextSnapshot = {
    kind: 'microphone',
    textId: original.id,
    revision: 0,
    timingRevision: 0,
    text: original.text,
    start: 8,
    end: 12,
    timeDomain: 'result',
  };
  const document = applyReviewOperation(baseline(original), operation(null, cut(1, 3)), source)
    .advancedContent.text!;
  const current = document.fragments[0]!;
  expect(reviewVoiceTextStatus(current, snapshot)).toBe('current');
  expect(
    reviewVoiceTextStatus(current, { ...snapshot, start: current.start, end: current.end })
  ).toBe('current');
  const edited = editReviewTextFragment(document, current.id, { start: 7, end: 11 });
  expect(edited.ok).toBe(true);
  if (!edited.ok) return;
  expect(edited.document.fragments[0]!.sourceAnchor).toBeUndefined();
  expect(reviewVoiceTextStatus(edited.document.fragments[0], snapshot)).toBe('timing-changed');
  const moved = baseline(edited.document.fragments[0]!);
  moved.edits = applyReviewOperation(baseline(), operation(null, cut(1, 3)), source).edits;
  const next = applyReviewOperation(moved, operation(cut(1, 3), null), source);
  expect(
    projectReviewTextFragment(next.advancedContent.text!.fragments[0]!, initial).ranges
  ).toEqual([{ start: 9, end: 13 }]);
  const content = editReviewTextFragment(document, current.id, { text: 'New words' });
  expect(content.ok && content.document.fragments[0]!.sourceAnchor?.words).toBeUndefined();
  const split = splitReviewTextFragment(document, current.id, { id: 'second', position: 4 });
  expect(split.ok).toBe(true);
  if (split.ok) {
    expect(split.document.fragments.every((fragment) => !fragment.sourceAnchor)).toBe(true);
    // Explicit joining requires adjacent intervals; the retained word silence is not flattened.
    expect(mergeReviewTextFragments(split.document, current.id, 'second')).toEqual({
      ok: false,
      reason: 'gap',
    });
  }
});

it('rejects malformed native placement, gates historical schemas, and keeps legacy replay unchanged', () => {
  const change = operation(null, cut(1, 3));
  const document = applyReviewOperation(baseline(), change, source);
  const content = document.advancedContent;
  for (const sourceAnchor of [
    null,
    {},
    { duration: Infinity, spans: [] },
    { duration: 4, spans: [{ start: 8, end: 12, offset: 1, duration: 4 }] },
  ]) {
    expect(
      parseReviewTextDocument({
        version: 1,
        fragments: [{ ...content.text!.fragments[0], sourceAnchor }],
      })
    ).toBeNull();
  }
  expect(loadQuickEditAdvancedContentState({ ...content, schemaVersion: 26 })).toBeNull();
  if (change.target !== 'edit') throw new Error('Expected edit');
  const { preserveTextAnchors: _flag, ...legacy } = change;
  const old = applyReviewOperation(baseline(), legacy, source);
  expect(old.advancedContent.text).toEqual(baseline().advancedContent.text);
  expect(
    parseReviewOperation({ ...change, preserveTextAnchors: false }, source.duration)
  ).toBeNull();
});

it.each(['source', 'result'] as const)(
  'preserves admitted sub-epsilon %s text without blocking a video timing command',
  (domain) => {
    const tiny = { ...phrase(domain), start: 1, end: 1.00000001, alignment: 'manual' as const };
    delete tiny.words;
    expect(parseReviewTextDocument({ version: 1, fragments: [tiny] })).not.toBeNull();
    for (const edit of [cut(2, 4), speed(0, 3)]) {
      const document = applyReviewOperation(baseline(tiny), operation(null, edit), source);
      const current = document.advancedContent.text!.fragments[0]!;
      const map = buildReviewTimeMap(source.duration, document.edits);
      const ranges = projectReviewTextFragment(current, map).ranges;
      expect(ranges).toHaveLength(1);
      expect(ranges[0]!.end - ranges[0]!.start).toBeCloseTo(tiny.end - tiny.start, 12);
      expect(current.sourceAnchor!.duration).toBe(tiny.end - tiny.start);
      expect(current.text).toBe(tiny.text);
      expect(loadQuickEditAdvancedContentState(document.advancedContent)).not.toBeNull();
    }
  }
);
