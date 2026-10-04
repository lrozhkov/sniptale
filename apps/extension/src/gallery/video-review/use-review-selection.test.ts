import { describe, expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import { createCanvasComment } from '../../features/video/review/comments';
import type { ReviewDocument, ReviewSelection } from '../../features/video/review/types';
import {
  reviewSelectionExists,
  reviewSelectionSourceTime,
  selectedHistoryRemoval,
} from './use-review-selection';

const document: ReviewDocument = {
  edits: [{ id: 'e', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 }],
  annotations: [
    { id: 'a', text: 'note', anchor: { kind: 'point', time: 1 } },
    { id: 'range', text: 'range note', anchor: { kind: 'range', start: 2, end: 6 } },
  ],
  canvasComments: [createCanvasComment({ id: 'c', at: 1 })],
  advancedContent: createQuickEditAdvancedContent(),
};

describe('review selection owner', () => {
  it('creates deletion operations only for history-owned selections', () => {
    expect(selectedHistoryRemoval({ kind: 'edit', id: 'e' }, document)).toMatchObject({
      target: 'edit',
      before: { id: 'e' },
      after: null,
    });
    expect(selectedHistoryRemoval({ kind: 'annotation', id: 'a' }, document)).toMatchObject({
      target: 'annotation',
      before: { id: 'a' },
      after: null,
    });
    expect(selectedHistoryRemoval({ kind: 'edit', id: 'missing' }, document)).toBeNull();
    expect(selectedHistoryRemoval({ kind: 'audio', lane: 'music', id: 'm' }, document)).toBeNull();
  });

  it('recognizes every live selection kind and rejects stale or unsupported ids', () => {
    const advanced = createQuickEditAdvancedState();
    advanced.zoom.regions = [
      {
        id: 'z',
        start: 0,
        end: 1,
        transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
        linkTo: 'z2',
      },
      {
        id: 'z2',
        start: 2,
        end: 3,
        transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'none', duration: 0 },
        exit: { type: 'none', duration: 0 },
      },
    ];
    advanced.audio.music = [
      {
        id: 'm',
        assetId: 'project-asset:m',
        timelineStart: 0,
        sourceOffset: 0,
        duration: 1,
        volume: 1,
        muted: false,
        fadeIn: 0,
        fadeOut: 0,
      },
    ];
    const live: ReviewSelection[] = [
      { kind: 'edit', id: 'e' },
      { kind: 'annotation', id: 'a' },
      { kind: 'canvas-comment', id: 'c' },
      { kind: 'zoom', id: 'z' },
      { kind: 'zoom-link', id: 'z' },
      { kind: 'audio', lane: 'music', id: 'm' },
    ];
    for (const selection of live)
      expect(reviewSelectionExists(selection, document, advanced)).toBe(true);
    expect(reviewSelectionExists({ kind: 'none' }, document, advanced)).toBe(false);
    // A stale or non-adjacent link selection is not live.
    expect(reviewSelectionExists({ kind: 'zoom-link', id: 'z2' }, document, advanced)).toBe(false);
    expect(
      reviewSelectionExists({ kind: 'zoom-link', id: 'unsupported' }, document, advanced)
    ).toBe(false);
    expect(
      reviewSelectionExists({ kind: 'audio', lane: 'voiceover', id: 'm' }, document, advanced)
    ).toBe(false);
  });
});

it('resolves active source objects and falls back for stale selections', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.zoom.enabled = true;
  advanced.ui = {
    mode: 'advanced',
    tracks: { actions: true, zoom: true, audio: true },
    overlaysVisible: true,
  };
  const region = {
    id: 'z',
    start: 4,
    end: 6,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    linkTo: 'next',
  };
  advanced.zoom.regions = [region, { ...region, id: 'next', start: 8, end: 10 }];
  advanced.audio.original.ranges = [{ id: 'volume', start: 2, end: 4, volume: 0.5 }];
  const fixture = {
    ...document,
    canvasComments: [{ ...document.canvasComments[0]!, start: 3, end: 5 }],
  };
  const markers = [
    { ref: { kind: 'action' as const, id: 'marker' }, start: 8, end: 10, eventType: 'CLICK' },
  ];
  const cases: Array<[ReviewSelection, number | null]> = [
    [{ kind: 'none' }, null],
    [{ kind: 'edit', id: 'e' }, 1.5],
    [{ kind: 'annotation', id: 'a' }, 1],
    [{ kind: 'annotation', id: 'range' }, 4],
    [{ kind: 'canvas-comment', id: 'c' }, 4],
    [{ kind: 'zoom', id: 'z' }, 6],
    [{ kind: 'zoom-link', id: 'z' }, 8],
    [{ kind: 'original-audio', id: 'volume' }, 3],
    [{ kind: 'telemetry', ref: markers[0]!.ref }, 9],
    [{ kind: 'zoom', id: 'missing' }, null],
  ];
  const before = structuredClone({ fixture, advanced });
  for (const [selection, expected] of cases)
    expect(reviewSelectionSourceTime(selection, fixture, advanced, 10, markers)).toBe(expected);
  advanced.zoom.regions[0]!.dormant = true;
  expect(reviewSelectionSourceTime({ kind: 'zoom', id: 'z' }, fixture, advanced, 10)).toBeNull();
  delete advanced.zoom.regions[0]!.dormant;
  expect({ fixture, advanced }).toEqual(before);
});

it('projects music from result time and keeps source-anchored voiceover on its rendered clock', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.zoom.enabled = true;
  advanced.ui = {
    mode: 'advanced',
    tracks: { actions: true, zoom: true, audio: true },
    overlaysVisible: true,
  };
  const clip = {
    id: 'audio',
    assetId: 'bytes',
    timelineStart: 2,
    sourceOffset: 0,
    duration: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  advanced.audio.music = [clip];
  expect(
    reviewSelectionSourceTime({ kind: 'audio', lane: 'music', id: clip.id }, document, advanced, 10)
  ).toBe(4);
  advanced.audio.voiceoverSegments = [
    { kind: 'keep', sourceStart: 0, sourceEnd: 10, resultStart: 0, resultEnd: 10, rate: 1 },
  ];
  advanced.audio.voiceover = [
    { ...clip, sourceAnchor: [{ start: 6, end: 8, offset: 0, duration: 2 }] },
  ];
  expect(
    reviewSelectionSourceTime(
      { kind: 'audio', lane: 'voiceover', id: clip.id },
      document,
      advanced,
      10
    )
  ).toBe(7);
});

it('uses rendered source anchors for focus and links after cuts', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.zoom.enabled = true;
  advanced.ui = {
    mode: 'advanced',
    tracks: { actions: true, zoom: true, audio: true },
    overlaysVisible: true,
  };
  const region = {
    id: 'focus',
    start: 5,
    end: 7,
    sourceAnchor: { start: 6, end: 8 },
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    linkTo: 'next',
  };
  advanced.zoom.regions = [
    region,
    {
      ...region,
      id: 'next',
      start: 8,
      end: 9,
      sourceAnchor: { start: 9, end: 10 },
    },
  ];
  expect(reviewSelectionSourceTime({ kind: 'zoom', id: 'focus' }, document, advanced, 10)).toBe(7);
  expect(
    reviewSelectionSourceTime({ kind: 'zoom-link', id: 'focus' }, document, advanced, 10)
  ).toBe(8.5);
});

it('falls back to the playhead for hidden focus and added audio without clearing selection', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.zoom.enabled = true;
  advanced.ui.mode = 'advanced';
  const region = {
    id: 'z',
    start: 2,
    end: 4,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    linkTo: 'next',
  };
  advanced.zoom.regions = [region, { ...region, id: 'next', start: 6, end: 8 }];
  const clip = {
    id: 'audio',
    assetId: 'bytes',
    timelineStart: 2,
    sourceOffset: 0,
    duration: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  advanced.audio.music = [clip];
  advanced.audio.voiceover = [clip];
  const selections: ReviewSelection[] = [
    { kind: 'zoom', id: 'z' },
    { kind: 'zoom-link', id: 'z' },
    { kind: 'audio', lane: 'music', id: 'audio' },
    { kind: 'audio', lane: 'voiceover', id: 'audio' },
  ];
  for (const selection of selections) {
    advanced.ui.tracks.zoom = true;
    advanced.ui.tracks.audio = true;
    expect(reviewSelectionSourceTime(selection, document, advanced, 10)).not.toBeNull();
    advanced.ui.tracks.zoom = false;
    advanced.ui.tracks.audio = false;
    const before = structuredClone({ selection, advanced });
    expect(reviewSelectionSourceTime(selection, document, advanced, 10)).toBeNull();
    expect({ selection, advanced }).toEqual(before);
    advanced.ui.mode = 'basic';
    advanced.ui.tracks.zoom = true;
    advanced.ui.tracks.audio = true;
    expect(reviewSelectionSourceTime(selection, document, advanced, 10)).toBeNull();
    advanced.ui.mode = 'advanced';
  }
});

it('ignores links suppressed by disabled effects or a cut while retaining visible region anchors', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.zoom = true;
  const region = {
    id: 'z',
    start: 0,
    end: 2,
    sourceAnchor: { start: 0, end: 2 },
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
    linkTo: 'next',
  };
  advanced.zoom.regions = [
    region,
    {
      ...region,
      id: 'next',
      start: 4,
      end: 6,
      sourceAnchor: { start: 5, end: 7 },
    },
  ];
  const link: ReviewSelection = { kind: 'zoom-link', id: 'z' };
  const plain = { ...document, edits: [] };
  advanced.zoom.enabled = true;
  expect(reviewSelectionSourceTime(link, plain, advanced, 10)).not.toBeNull();
  advanced.zoom.enabled = false;
  expect(reviewSelectionSourceTime(link, plain, advanced, 10)).toBeNull();
  expect(reviewSelectionSourceTime({ kind: 'zoom', id: 'z' }, plain, advanced, 10)).toBe(1);
  advanced.zoom.enabled = true;
  const cut = { ...document, edits: [{ ...document.edits[0]!, start: 3, end: 4 }] };
  expect(reviewSelectionSourceTime(link, cut, advanced, 10)).toBeNull();
});

it('ignores hidden actions and overlays while preserving their selections', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const marker = {
    ref: { kind: 'action' as const, id: 'marker' },
    start: 6,
    end: 8,
    eventType: 'CLICK',
  };
  const action: ReviewSelection = { kind: 'telemetry', ref: marker.ref };
  const comment: ReviewSelection = { kind: 'canvas-comment', id: 'c' };
  expect(reviewSelectionSourceTime(action, document, advanced, 10, [marker])).toBe(7);
  expect(reviewSelectionSourceTime(comment, document, advanced, 10)).not.toBeNull();
  advanced.ui.tracks.actions = false;
  advanced.ui.overlaysVisible = false;
  const before = structuredClone({ action, comment, advanced });
  expect(reviewSelectionSourceTime(action, document, advanced, 10, [marker])).toBeNull();
  expect(reviewSelectionSourceTime(comment, document, advanced, 10)).toBeNull();
  expect({ action, comment, advanced }).toEqual(before);
});

it('falls back when media indexing removes an unavailable original-audio lane', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.audio.original.ranges = [{ id: 'volume', start: 2, end: 4, volume: 0.5 }];
  const selection: ReviewSelection = { kind: 'original-audio', id: 'volume' };
  expect(reviewSelectionSourceTime(selection, document, advanced, 10, [], true)).toBe(3);
  expect(reviewSelectionSourceTime(selection, document, advanced, 10, [], false)).toBeNull();
  expect(advanced.audio.original.ranges).toHaveLength(1);
});

it('ignores an individually hidden canvas comment without clearing it', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  const selection: ReviewSelection = { kind: 'canvas-comment', id: 'c' };
  const hidden = {
    ...document,
    canvasComments: [{ ...document.canvasComments[0]!, visible: false }],
  };
  const before = structuredClone({ selection, hidden });
  expect(reviewSelectionSourceTime(selection, hidden, advanced, 10)).toBeNull();
  expect({ selection, hidden }).toEqual(before);
});
