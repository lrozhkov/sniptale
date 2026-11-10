import { expect, it } from 'vitest';
import { loadQuickEditAdvancedContentState } from '../../features/video/review/advanced/validation';
import { cloneReviewTimelineSelection } from './timeline-clone';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import type { ReviewSelection } from '../../features/video/review/types';

it('clones a mixed group without mutating originals or duplicating immutable assets', () => {
  const content = createQuickEditAdvancedContent();
  content.zoom.regions = [createQuickEditZoomRegion({ id: 'zoom', at: 1, duration: 2 })];
  content.annotationEffects = {
    enabled: true,
    instances: [
      {
        id: 'annotation',
        snapshotId: 'snapshot',
        enabled: true,
        start: 1,
        end: 3,
        attachment: 'content',
        transform: { x: 0.1, y: 0.1, width: 0.2, height: 0.2, rotation: 0 },
        controls: {},
        order: 0,
      },
    ],
  };
  content.text = {
    version: 1,
    fragments: [
      {
        id: 'text',
        start: 1,
        end: 3,
        text: 'Hello',
        originalText: 'Hello',
        revision: 0,
        timingRevision: 0,
        timeDomain: 'source',
        showInVideo: true,
        alignment: 'manual',
      },
    ],
  };
  for (const lane of ['music', 'voiceover'] as const)
    content.audio[lane] = [
      createQuickEditAudioClip({
        id: lane,
        assetId: 'asset:' + lane,
        timelineStart: 1,
        duration: 2,
        endMax: 20,
      }),
    ];
  content.audio.original.ranges = [{ id: 'original', start: 1, end: 3, volume: 0.5 }];
  content.webcam = createQuickEditWebcam(
    'project-asset:webcam',
    { width: 640, height: 480 },
    { width: 1920, height: 1080 }
  );
  content.webcam.positions = [
    {
      id: 'position',
      time: 1,
      placement: content.webcam.placement,
      transition: { type: 'none', duration: 0 },
    },
  ];
  content.webcam.hiddenRanges = [{ id: 'hidden', start: 1, end: 3 }];
  content.cursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'follow',
    gapPolicy: 'hold',
    segments: [
      {
        id: 'segment',
        binding: { kind: 'project' },
        start: 0,
        end: 20,
        keys: [
          { id: 'cursor', time: 1, x: 0.5, y: 0.5, anchor: 'manual', interpolation: 'smooth' },
        ],
      },
    ],
  };
  const selections: ReviewSelection[] = [
    { kind: 'zoom', id: 'zoom' },
    { kind: 'annotation-effect', id: 'annotation' },
    { kind: 'text', id: 'text' },
    { kind: 'audio', lane: 'music', id: 'music' },
    { kind: 'audio', lane: 'voiceover', id: 'voiceover' },
    { kind: 'original-audio', id: 'original' },
    { kind: 'webcam-position', id: 'position' },
    { kind: 'webcam-hidden', id: 'hidden' },
    { kind: 'cursor-focus', id: 'cursor', time: 1 },
  ];
  for (const [key, value] of Object.entries(content))
    expect(
      loadQuickEditAdvancedContentState({ ...createQuickEditAdvancedContent(), [key]: value }),
      'fixture ' + key
    ).not.toBeNull();
  expect(loadQuickEditAdvancedContentState(content), 'fixture').not.toBeNull();
  for (const selection of selections)
    expect(
      cloneReviewTimelineSelection({ content, edits: [], selections: [selection], duration: 20 }),
      selection.kind
    ).not.toBeNull();
  const original = structuredClone(content);
  let counter = 0;
  const result = cloneReviewTimelineSelection({
    content,
    edits: [],
    selections,
    duration: 20,
    id: () => `copy-${++counter}`,
  });
  expect(result).not.toBeNull();
  expect(content).toEqual(original);
  expect(result!.content.zoom.regions).toHaveLength(2);
  expect(result!.content.zoom.regions.find((item) => item.id !== 'zoom')?.overlapPolicy).toBe(
    'suppress'
  );
  expect(result!.content.annotationEffects!.instances[1]?.snapshotId).toBe('snapshot');
  expect(result!.content.audio.music[1]?.assetId).toBe('asset:music');
  expect(result!.content.text!.fragments).toHaveLength(2);
  expect(result!.content.webcam!.positions).toHaveLength(2);
  expect(result!.content.webcam!.hiddenRanges[1]).toMatchObject({ start: 3, end: 5 });
  expect(result!.content.audio.original.ranges![1]).toMatchObject({
    start: 3,
    end: 5,
    volume: 0.5,
  });
  expect(result!.content.cursorFocusPath!.segments[0]!.keys).toHaveLength(2);
});
it('plans disjoint source edits and rejects insufficient space before changing content', () => {
  const content = createQuickEditAdvancedContent();
  const edit = {
    id: 'speed',
    kind: 'speed' as const,
    start: 1,
    end: 3,
    requestedStart: 1,
    requestedEnd: 3,
    rate: 2 as const,
    audio: 'speed' as const,
  };
  const result = cloneReviewTimelineSelection({
    content,
    edits: [edit],
    selections: [{ kind: 'edit', id: 'speed' }],
    duration: 10,
    id: () => 'copy',
  });
  expect(result?.edits).toEqual([
    { ...edit, id: 'copy', start: 3, end: 5, requestedStart: 3, requestedEnd: 5 },
  ]);
  expect(
    cloneReviewTimelineSelection({
      content,
      edits: [edit],
      selections: [{ kind: 'edit', id: 'speed' }],
      duration: 3,
    })
  ).toBeNull();
  expect(content).toEqual(createQuickEditAdvancedContent());
});
it('does not fabricate captured cursor events or copy a transition without its endpoints', () => {
  const content = createQuickEditAdvancedContent();
  for (const item of [
    { kind: 'telemetry', ref: { kind: 'action', id: 'captured' } },
    { kind: 'cursor-focus', id: 'captured', time: 1 },
    { kind: 'zoom-link', id: 'missing' },
  ] as ReviewSelection[])
    expect(
      cloneReviewTimelineSelection({ content, edits: [], selections: [item], duration: 20 })
    ).toBeNull();
});

it('copies cursor intervals as an atomic group with fresh point identities and refuses insufficient space', () => {
  const content = createQuickEditAdvancedContent();
  content.cursorMotions = ['a', 'b'].map((id, index) => ({
    id,
    start: index,
    end: index + 1,
    enabled: true,
    shape: 'pointer',
    size: 48,
    color: '#123456',
    outline: '#ffffff',
    shadow: true,
    easing: 'smooth',
    points: [
      { id: `${id}:start`, at: 0, x: 0.2, y: 0.3 },
      { id: `${id}:end`, at: 1, x: 0.8, y: 0.7 },
    ],
  }));
  const before = structuredClone(content);
  const selections: ReviewSelection[] = content.cursorMotions.map((motion) => ({
    kind: 'cursor-motion',
    id: motion.id,
  }));
  let counter = 0;
  const plan = cloneReviewTimelineSelection({
    content,
    edits: [],
    selections,
    duration: 4,
    id: () => `copy${++counter}`,
  });
  expect(plan).not.toBeNull();
  const copies = plan!.content.cursorMotions!.slice(2);
  expect(copies.map((motion) => [motion.start, motion.end])).toEqual([
    [2, 3],
    [3, 4],
  ]);
  for (const [index, motion] of copies.entries()) {
    const original = content.cursorMotions[index]!;
    expect(motion.id).not.toBe(original.id);
    expect(motion.points.map(({ id: _id, ...point }) => point)).toEqual(
      original.points.map(({ id: _id, ...point }) => point)
    );
    expect(
      motion.points.every((point) => !original.points.some((old) => old.id === point.id))
    ).toBe(true);
    expect(motion).toMatchObject({
      shape: original.shape,
      color: original.color,
      easing: original.easing,
    });
  }
  expect(loadQuickEditAdvancedContentState(plan!.content)).not.toBeNull();
  expect(cloneReviewTimelineSelection({ content, edits: [], selections, duration: 2 })).toBeNull();
  expect(content).toEqual(before);
});
