import { expect, it } from 'vitest';
import { createQuickEditAdvancedContent } from '../../features/video/review/advanced/defaults';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { loadQuickEditAdvancedContentState } from '../../features/video/review/advanced/validation';
import { removeReviewTrackItems, reviewTrackItems } from './track-items';

it('keeps retained source focus intervals visible under cuts and separates the read-only source from edits', () => {
  const advancedContent = createQuickEditAdvancedContent();
  advancedContent.zoom.regions = [
    {
      ...createQuickEditZoomRegion({ id: 'focus', at: 2, duration: 1 }),
      sourceAnchor: { start: 5, end: 8 },
    },
  ];
  const document = { advancedContent, annotations: [], canvasComments: [], edits: [] };
  const args = {
    track: 'zoom' as const,
    document,
    source: { duration: 10, width: 1280, height: 720, mimeType: 'video/mp4', size: 1 },
    filename: 'capture.mp4',
    assets: new Map(),
    snapshots: [],
    locale: 'ru' as const,
  };
  expect(reviewTrackItems(args)[0]).toMatchObject({
    id: 'focus',
    start: 5,
    end: 8,
    removable: true,
  });
  expect(reviewTrackItems({ ...args, track: 'source' })[0]).toMatchObject({
    id: 'source',
    removable: false,
    start: 0,
    end: 10,
  });
});

it('removes selected voiceover clips and their mute bindings while preserving other audio and accepted state', () => {
  const content = createQuickEditAdvancedContent();
  const clip = {
    id: 'take',
    assetId: 'audio-asset',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 2,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
  content.audio.voiceover = [clip, { ...clip, id: 'keep', timelineStart: 3 }];
  content.audio.original.mutes = [{ id: 'binding', kind: 'take', clipId: 'take' }];
  const before = structuredClone(content);
  const after = removeReviewTrackItems(content, 'voiceover', new Set(['take']), 10);
  expect(after.audio.voiceover.map((item) => item.id)).toEqual(['keep']);
  expect(after.audio.original.mutes).toEqual([]);
  expect(content).toEqual(before);
  expect(loadQuickEditAdvancedContentState(after)).not.toBeNull();
});

it('removes several focus items as one content change while retaining unrelated camera data', () => {
  const content = createQuickEditAdvancedContent();
  content.zoom.regions = ['a', 'b', 'keep'].map((id, i) =>
    createQuickEditZoomRegion({ id, at: i * 3, duration: 2 })
  );
  const after = removeReviewTrackItems(content, 'zoom', new Set(['a', 'b']), 10);
  expect(after.zoom.regions.map((item) => item.id)).toEqual(['keep']);
  expect(content.zoom.regions).toHaveLength(3);
});

it('lists and removes each supported authored lane while keeping immutable source and media identities', async () => {
  const { createQuickEditAudioClip } = await import('../../features/video/review/advanced/audio');
  const { createQuickEditWebcam } = await import('../../features/video/review/advanced/webcam');
  const content = createQuickEditAdvancedContent();
  content.cursorMotions = [
    {
      id: 'cursor',
      start: 1,
      end: 2,
      enabled: true,
      shape: 'pointer',
      size: 48,
      color: '#000000',
      outline: '#ffffff',
      shadow: false,
      easing: 'linear',
      points: [
        { id: 'a', at: 0, x: 0.2, y: 0.2 },
        { id: 'b', at: 1, x: 0.8, y: 0.8 },
      ],
    },
  ];
  content.annotationEffects = {
    enabled: true,
    instances: [
      {
        id: 'annotation',
        snapshotId: 'missing',
        enabled: false,
        start: 1,
        end: 2,
        attachment: 'content',
        transform: { x: 0, y: 0, width: 0.2, height: 0.2, rotation: 0 },
        controls: {},
        order: 0,
      },
    ],
  };
  for (const track of ['music', 'voiceover'] as const)
    content.audio[track] = [
      createQuickEditAudioClip({
        id: track,
        assetId: `asset:${track}`,
        timelineStart: 1,
        duration: 1,
        endMax: 10,
      }),
      {
        ...createQuickEditAudioClip({
          id: `${track}Muted`,
          assetId: `asset:${track}`,
          timelineStart: 3,
          duration: 1,
          endMax: 10,
        }),
        muted: true,
      },
    ];
  content.audio.voiceover[0]!.sourceAnchor = [{ start: 5, end: 6, offset: 0, duration: 1 }];
  content.audio.original.ranges = [{ id: 'range', start: 1, end: 2, volume: 0.5 }];
  content.webcam = createQuickEditWebcam(
    'asset:camera',
    { width: 640, height: 480 },
    { width: 1280, height: 720 }
  );
  content.webcam.positions = [
    {
      id: 'position',
      time: 1,
      placement: content.webcam.placement,
      transition: { type: 'none', duration: 0 },
    },
  ];
  content.webcam.hiddenRanges = [{ id: 'hidden', start: 1, end: 2 }];
  const document = {
    advancedContent: content,
    annotations: [],
    canvasComments: [],
    edits: [
      {
        id: 'speed',
        kind: 'speed' as const,
        audio: 'speed' as const,
        requestedStart: 1,
        requestedEnd: 2,
        start: 1,
        end: 2,
        rate: 2 as const,
      },
      { id: 'cut', kind: 'cut' as const, requestedStart: 4, requestedEnd: 5, start: 4, end: 5 },
    ],
  };
  const args = {
    document,
    source: { duration: 10, width: 1280, height: 720, mimeType: 'video/mp4', size: 1 },
    filename: 'source.mp4',
    assets: new Map(),
    snapshots: [],
    locale: 'en' as const,
  };
  const before = structuredClone(content);
  for (const track of [
    'source',
    'cursorMotion',
    'annotationEffects',
    'music',
    'voiceover',
    'originalAudio',
    'webcam',
  ] as const) {
    const rows = reviewTrackItems({ ...args, track });
    expect(rows.length).toBeGreaterThan(0);
    const removable = rows.filter((row) => row.removable);
    expect(removable.every((row) => !!row.timelineKey)).toBe(true);
    if (track === 'source') {
      expect(rows[0]!.removable).toBe(false);
      expect(rows.find((row) => row.id === 'speed')!.detail).toContain('2');
      continue;
    }
    const after = removeReviewTrackItems(
      content,
      track,
      new Set(removable.map((row) => row.id)),
      10
    );
    expect(
      reviewTrackItems({
        ...args,
        document: { ...document, advancedContent: after },
        track,
      }).filter((row) => row.removable)
    ).toEqual([]);
    expect(after.audio.voiceover === content.audio.voiceover || track === 'voiceover').toBe(true);
  }
  expect(reviewTrackItems({ ...args, track: 'text' })).toEqual([]);
  expect(removeReviewTrackItems(content, 'text', new Set(), 10)).toBe(content);
  expect(content).toEqual(before);
});
