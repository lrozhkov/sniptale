import { expect, it } from 'vitest';
import { createQuickEditAdvancedContent } from './advanced/defaults';
import { createQuickEditZoomRegion } from './advanced/zoom';
import { applyReviewOperation, replayReviewHistory } from './document';
import { projectReviewFocus } from './focus-edits';
import {
  projectReviewAnnotationEffect,
  sampleReviewAnnotationEffect,
} from './annotation-effects/timing';
import { projectAnchoredReviewText } from './text-timing';
import { projectReviewVoiceover } from './voiceover-edits';
import { buildReviewTimeMap, createReviewDisplayMap, mapReviewAnchor } from './timeline';
import type { ReviewDocument, ReviewOperation } from './types';

it('inserts and removes one shared interval without changing authored events or losing crossing lane data', () => {
  const source = { duration: 12, width: 640, height: 360, size: 100, mimeType: 'video/mp4' };
  const content = createQuickEditAdvancedContent();
  content.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'asset',
      timelineStart: 3,
      duration: 4,
      sourceOffset: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  content.audio.music = [
    { ...content.audio.voiceover[0]!, id: 'music', timelineStart: 6, duration: 3 },
  ];
  content.zoom.regions = [
    {
      ...createQuickEditZoomRegion({ id: 'camera', at: 2, duration: 6 }),
      sourceAnchor: { start: 2, end: 8 },
    },
  ];
  content.text = {
    version: 1,
    fragments: [
      {
        id: 'text',
        start: 3,
        end: 7,
        text: 'Held text',
        originalText: 'Held text',
        revision: 0,
        timingRevision: 0,
        timeDomain: 'source',
        alignment: 'range',
        showInVideo: true,
      },
    ],
  };
  const baseline: ReviewDocument = {
    annotations: [{ id: 'note', text: 'Later', anchor: { kind: 'point', time: 8 } }],
    canvasComments: [],
    edits: [],
    advancedContent: content,
  };
  const original = structuredClone(baseline);
  const freeze = {
    id: 'freeze',
    kind: 'freeze' as const,
    start: 4,
    end: 4,
    requestedStart: 4,
    requestedEnd: 4,
    duration: 2,
    frameTime: 3.98,
    frameDuration: 0.04,
  };
  const policy = {
    target: 'edit' as const,
    preserveUnderCuts: true as const,
    preserveFocusAnchors: true as const,
    preserveVoiceoverAnchors: true as const,
    preserveTextAnchors: true as const,
  };
  const insert: ReviewOperation = { ...policy, id: 'insert', at: 1, before: null, after: freeze };
  const remove: ReviewOperation = { ...policy, id: 'remove', at: 2, before: freeze, after: null };
  const after = applyReviewOperation(baseline, insert, source);
  const map = buildReviewTimeMap(12, after.edits);
  expect(
    projectReviewVoiceover(after.advancedContent.audio.voiceover, map, 'source')
  ).toMatchObject([
    { timelineStart: 3, duration: 1, sourceOffset: 1 },
    { timelineStart: 6, duration: 3, sourceOffset: 2 },
  ]);
  expect(projectReviewVoiceover(after.advancedContent.audio.music, map)).toMatchObject([
    { timelineStart: 8, duration: 3 },
  ]);
  expect(
    projectReviewFocus(after.advancedContent.zoom.regions, map).some(
      (region) => region.start <= 5 && region.end > 5
    )
  ).toBe(true);
  expect(
    projectAnchoredReviewText(after.advancedContent.text!.fragments[0]!, map).some(
      (slice) => slice.start <= 5 && slice.end > 5
    )
  ).toBe(true);
  const annotation = { start: 3, end: 7 };
  expect(
    sampleReviewAnnotationEffect(projectReviewAnnotationEffect(annotation, map), 4, 5)
  ).not.toBeNull();
  expect(mapReviewAnchor({ kind: 'point', time: 8 }, map).ranges).toEqual([{ start: 10, end: 10 }]);
  const display = createReviewDisplayMap(12, after.edits);
  for (const time of [6, 7, 8]) expect(display.sourceToDisplay(time)).toBe(time + 2);
  for (const cursor of [0, 1, 2, 1, 2]) {
    const restored = replayReviewHistory(
      JSON.parse(JSON.stringify([insert, remove])),
      cursor,
      source,
      baseline
    );
    const segments = buildReviewTimeMap(12, restored.edits);
    const inserted = cursor === 1 ? 2 : 0;
    expect(segments.at(-1)!.resultEnd).toBe(12 + inserted);
    expect(
      projectReviewVoiceover(restored.advancedContent.audio.music, segments)[0]!.timelineStart
    ).toBe(6 + inserted);
    expect(restored.annotations).toEqual(original.annotations);
    expect(projectReviewAnnotationEffect(annotation, segments).duration).toBe(4 + inserted);
  }
  expect(baseline).toEqual(original);
});

it.each([
  [4, 6],
  [2, 4],
])('preserves inserted time when a cut touches its source anchor (%s–%s)', (start, end) => {
  const freeze = {
    id: 'hold',
    kind: 'freeze' as const,
    start: 4,
    end: 4,
    requestedStart: 4,
    requestedEnd: 4,
    duration: 2,
    frameTime: 3.98,
    frameDuration: 0.04,
  };
  const cut = {
    id: 'cut',
    kind: 'cut' as const,
    start,
    end,
    requestedStart: start,
    requestedEnd: end,
  };
  const map = buildReviewTimeMap(12, [freeze, cut]);
  const hold = map.find((part) => part.freezeId === freeze.id);
  expect(hold).toBeDefined();
  expect(hold!.resultEnd - hold!.resultStart).toBe(2);
  expect(map.at(-1)!.resultEnd).toBe(12);
  const annotation = {
    start: hold!.resultStart,
    end: hold!.resultEnd,
    timeDomain: 'result' as const,
  };
  const projected = projectReviewAnnotationEffect(annotation, map);
  expect(projected.duration).toBe(2);
  expect(sampleReviewAnnotationEffect(projected, 3.98, hold!.resultStart + 1)).not.toBeNull();
  expect(createReviewDisplayMap(12, [freeze, cut]).duration).toBe(14);
});
