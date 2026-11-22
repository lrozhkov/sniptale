import { describe, expect, it } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import { createCanvasComment } from '../../features/video/review/comments';
import type { ReviewDocument, ReviewSelection } from '../../features/video/review/types';
import {
  reviewSelectionExists,
  reviewSelectionSeekTarget,
  reviewSelectionInterval,
  reviewSelectionSourceTime,
  selectedHistoryRemoval,
} from './use-review-selection';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { anchorReviewVoiceover } from '../../features/video/review/voiceover-edits';

const document: ReviewDocument = {
  edits: [{ id: 'e', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 }],
  annotations: [
    { id: 'a', text: 'note', anchor: { kind: 'point', time: 1 } },
    { id: 'range', text: 'range note', anchor: { kind: 'range', start: 2, end: 6 } },
  ],
  canvasComments: [createCanvasComment({ id: 'c', at: 1 })],
  advancedContent: createQuickEditAdvancedContent(),
};

it('uses one inside/outside rule for interval selections on every lane', () => {
  const advanced = createQuickEditAdvancedState();
  const region = {
    id: 'zoom',
    start: 1,
    end: 3,
    transform: { scale: 2, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'none' as const, duration: 0 },
    exit: { type: 'none' as const, duration: 0 },
  };
  advanced.zoom.regions = [
    { ...region, linkTo: 'next' },
    { ...region, id: 'next', start: 7, end: 9 },
  ];
  advanced.cursorMotions = [
    {
      id: 'cursor',
      start: 3,
      end: 7,
      enabled: true,
      shape: 'arrow',
      size: 24,
      color: '#000000',
      outline: '#ffffff',
      shadow: false,
      easing: 'linear',
      points: [],
    },
  ];
  const clip = {
    id: 'audio',
    assetId: 'bytes',
    timelineStart: 3,
    duration: 4,
    sourceOffset: 0,
    muted: false,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
  advanced.audio.voiceover = [clip];
  advanced.audio.music = [clip];
  advanced.audio.original.ranges = [{ id: 'original', start: 3, end: 7, volume: 0.5 }];
  advanced.annotationEffects = {
    enabled: true,
    instances: [
      {
        id: 'effect',
        snapshotId: 'effect:source',
        start: 3,
        end: 7,
        enabled: true,
        order: 0,
        controls: {},
        attachment: 'content',
        transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
      },
    ],
  };
  advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'text',
        start: 3,
        end: 7,
        text: 'text',
        originalText: '',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        showInVideo: true,
        timeDomain: 'result',
      },
    ],
  };
  advanced.webcam = createQuickEditWebcam(
    'camera',
    { width: 640, height: 480 },
    { width: 1280, height: 720 }
  );
  advanced.webcam.hiddenRanges = [{ id: 'hidden', start: 3, end: 7 }];
  advanced.webcam.positions = [3, 7].map((time) => ({
    id: `position:${time}`,
    time,
    placement: advanced.webcam!.placement,
    transition: { type: 'none', duration: 0 },
  }));
  const markers = [
    { ref: { kind: 'action' as const, id: 'marker' }, start: 3, end: 7, eventType: 'CLICK' },
  ];
  const plain = {
    ...document,
    edits: [],
    canvasComments: [{ ...document.canvasComments[0]!, start: 3, end: 7 }],
  };
  const cases: [ReviewSelection, number, number, 'source' | 'result'][] = [
    [{ kind: 'annotation', id: 'range' }, 2, 6, 'source'],
    [{ kind: 'canvas-comment', id: 'c' }, 3, 7, 'source'],
    [{ kind: 'zoom', id: 'zoom' }, 1, 3, 'result'],
    [{ kind: 'zoom-link', id: 'zoom' }, 3, 7, 'result'],
    [{ kind: 'cursor-motion', id: 'cursor' }, 3, 7, 'result'],
    [{ kind: 'annotation-effect', id: 'effect' }, 3, 7, 'source'],
    [{ kind: 'text', id: 'text' }, 3, 7, 'result'],
    [{ kind: 'audio', lane: 'voiceover', id: 'audio' }, 3, 7, 'result'],
    [{ kind: 'audio', lane: 'music', id: 'audio' }, 3, 7, 'result'],
    [{ kind: 'original-audio', id: 'original' }, 3, 7, 'source'],
    [{ kind: 'telemetry', ref: markers[0]!.ref }, 3, 7, 'source'],
    [{ kind: 'webcam' }, 0, 12, 'source'],
    [{ kind: 'webcam-hidden', id: 'hidden' }, 3, 7, 'source'],
    [{ kind: 'webcam-position', id: 'position:3' }, 3, 7, 'source'],
  ];
  for (const [selection, start, end, domain] of cases) {
    for (const time of [start, (start + end) / 2, start - 1, end, end + 1]) {
      const target = reviewSelectionSeekTarget(selection, {
        document: plain,
        advanced,
        duration: 12,
        markers,
        sourceTime: time,
        resultTime: time,
      });
      expect(target, `${selection.kind} at ${time}`).toEqual(
        time >= start && time < end ? null : { domain, time: start }
      );
    }
  }
});

it('keeps freeze/result selection inside inserted time and projects the full music interval', () => {
  const edit = {
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
  const advanced = createQuickEditAdvancedState();
  const clip = anchorReviewVoiceover(
    {
      id: 'music',
      assetId: 'bytes',
      timelineStart: 3,
      duration: 4,
      sourceOffset: 0,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
    buildReviewTimeMap(12, [])
  );
  advanced.audio.music = [clip];
  const context = {
    document: { ...document, edits: [edit] },
    advanced,
    duration: 12,
    markers: [],
    sourceTime: 4,
    resultTime: 5,
  };
  expect(reviewSelectionSeekTarget({ kind: 'edit', id: 'hold' }, context)).toBeNull();
  expect(
    reviewSelectionSeekTarget({ kind: 'edit', id: 'hold' }, { ...context, resultTime: 6 })
  ).toEqual({ domain: 'result', time: 4 });
  expect(
    reviewSelectionSeekTarget(
      { kind: 'audio', lane: 'music', id: 'music' },
      { ...context, resultTime: 8.5 }
    )
  ).toBeNull();
  expect(
    reviewSelectionSeekTarget(
      { kind: 'audio', lane: 'music', id: 'music' },
      { ...context, resultTime: 9 }
    )
  ).toEqual({ domain: 'result', time: 3 });
  expect(
    reviewSelectionSeekTarget({ kind: 'cursor-focus', id: 'key', time: 4 }, context)
  ).toBeNull();
  expect(reviewSelectionSeekTarget({ kind: 'cursor-focus', id: 'key', time: 7 }, context)).toEqual({
    domain: 'source',
    time: 7,
  });
  expect(reviewSelectionSeekTarget({ kind: 'text', id: 'missing' }, context)).toBeNull();
});

describe('review selection owner', () => {
  it('resolves authored text in its declared clock and clears a deleted text selection', () => {
    const advanced = createQuickEditAdvancedState();
    const fragment = {
      id: 'text',
      text: 'Hello',
      originalText: '',
      start: 1,
      end: 3,
      timeDomain: 'result' as const,
      revision: 0,
      timingRevision: 0,
      alignment: 'manual' as const,
      showInVideo: true,
    };
    advanced.text = { version: 1, fragments: [fragment] };
    const selection: ReviewSelection = { kind: 'text', id: fragment.id };
    expect(reviewSelectionExists(selection, document, advanced)).toBe(true);
    expect(selectedHistoryRemoval(selection, document)).toBeNull();
    expect(reviewSelectionSourceTime(selection, document, advanced, 10, [])).toBe(3);
    advanced.text = { version: 1, fragments: [{ ...fragment, timeDomain: 'source' }] };
    expect(reviewSelectionSourceTime(selection, document, advanced, 10, [])).toBe(2);
    advanced.text = { version: 1, fragments: [] };
    expect(reviewSelectionExists(selection, document, advanced)).toBe(false);
    expect(reviewSelectionSourceTime(selection, document, advanced, 10, [])).toBeNull();
  });

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

it('retains disabled effect selection and source timing, but stops navigation in basic mode', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'advanced';
  advanced.annotationEffects = {
    enabled: false,
    instances: [
      {
        id: 'visual',
        snapshotId: 'effect:source',
        enabled: false,
        start: 2,
        end: 6,
        attachment: 'content',
        controls: {},
        order: 0,
        transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
      },
    ],
  };
  const selected: ReviewSelection = { kind: 'annotation-effect', id: 'visual' };
  expect(reviewSelectionExists(selected, document, advanced)).toBe(true);
  expect(reviewSelectionSourceTime(selected, document, advanced, 10)).toBe(4);
  expect(selectedHistoryRemoval(selected, document)).toBeNull();
  advanced.ui.mode = 'basic';
  expect(reviewSelectionSourceTime(selected, document, advanced, 10)).toBeNull();
  expect(reviewSelectionExists(selected, document, advanced)).toBe(true);
  advanced.annotationEffects.instances = [];
  expect(reviewSelectionExists(selected, document, advanced)).toBe(false);
});

it('retains a selected raw cursor sample even when the simplified path omits it', () => {
  const advanced = createQuickEditAdvancedState();
  const selection: ReviewSelection = { kind: 'cursor-focus', id: 'raw', time: 1 };
  expect(reviewSelectionExists(selection, document, advanced, [], undefined, [{ id: 'raw' }])).toBe(
    true
  );
  expect(reviewSelectionExists(selection, document, advanced, [], undefined, [])).toBe(false);
});

it('selects the full bounding interval across lanes and gaps without changing authored data', () => {
  const advanced = createQuickEditAdvancedState();
  const source = {
    ...document,
    edits: [],
    canvasComments: [{ ...document.canvasComments[0]!, start: 7, end: 9 }],
  };
  const context = { advanced, document: source, duration: 12, markers: [] };
  expect(reviewSelectionInterval([{ kind: 'annotation', id: 'range' }], context)).toEqual({
    start: 2,
    end: 6,
    result: { start: 2, end: 6 },
  });
  expect(
    reviewSelectionInterval(
      [
        { kind: 'annotation', id: 'range' },
        { kind: 'canvas-comment', id: 'c' },
      ],
      context
    )
  ).toEqual({ start: 2, end: 9, result: { start: 2, end: 9 } });
  expect(source.canvasComments[0]!.start).toBe(7);
  expect(reviewSelectionInterval([], context)).toBeNull();
  expect(reviewSelectionInterval([{ kind: 'annotation', id: 'a' }], context)).toBeNull();
  expect(
    reviewSelectionInterval(
      [
        { kind: 'annotation', id: 'range' },
        { kind: 'text', id: 'missing' },
      ],
      context
    )
  ).toBeNull();
  expect(
    reviewSelectionInterval(
      [
        { kind: 'cursor-focus', id: 'first', time: 1 },
        { kind: 'cursor-focus', id: 'second', time: 8 },
      ],
      context
    )
  ).toEqual({ start: 1, end: 8, result: { start: 1, end: 8 } });
});

it('retains freeze extents, speed mapping and cut-only editing intervals', () => {
  const advanced = createQuickEditAdvancedState();
  const freeze = {
    id: 'freeze',
    kind: 'freeze' as const,
    start: 4,
    end: 4,
    duration: 2,
    frameTime: 4,
    frameDuration: 0.04,
    requestedStart: 4,
    requestedEnd: 4,
  };
  const context = {
    advanced,
    document: { ...document, edits: [freeze] },
    duration: 12,
    markers: [],
  };
  expect(reviewSelectionInterval([{ kind: 'edit', id: 'freeze' }], context)).toEqual({
    start: 4,
    end: 4,
    result: { start: 4, end: 6 },
  });
  expect(
    reviewSelectionInterval(
      [
        { kind: 'edit', id: 'freeze' },
        { kind: 'annotation', id: 'range' },
      ],
      context
    )
  ).toEqual({ start: 2, end: 6, result: { start: 2, end: 8 } });
  const speed = {
    id: 'speed',
    kind: 'speed' as const,
    start: 2,
    end: 6,
    requestedStart: 2,
    requestedEnd: 6,
    rate: 2 as const,
    audio: 'speed' as const,
  };
  expect(
    reviewSelectionInterval([{ kind: 'edit', id: 'speed' }], {
      ...context,
      document: { ...document, edits: [speed] },
    })
  ).toEqual({ start: 2, end: 6, result: { start: 2, end: 4 } });
  expect(
    reviewSelectionInterval([{ kind: 'edit', id: 'e' }], {
      ...context,
      document,
    })
  ).toEqual({ start: 1, end: 2 });
});
