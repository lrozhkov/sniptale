import { describe, expect, it, vi } from 'vitest';
import {
  mergeClipTimeRanges,
  splitClipAfterOverwrite,
  type ClipTimeRange,
} from './overwrite-segments.helpers.ts';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  VideoProjectShapeType,
  type VideoProjectAudioClip,
  type VideoProjectShapeClip,
  type VideoProjectVideoClip,
} from '../types/index';

function createBaseTransform() {
  return {
    height: 720,
    opacity: 1,
    rotation: 0,
    width: 1280,
    x: 0,
    y: 0,
  };
}

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 10,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'video-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Video',
    sourceDuration: 10,
    sourceStart: 5,
    startTime: 0,
    trackId: 'track-video',
    transform: createBaseTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
    ...overrides,
  };
}

function createAudioClip(overrides: Partial<VideoProjectAudioClip> = {}): VideoProjectAudioClip {
  return {
    assetId: 'asset-2',
    duration: 10,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'audio-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Audio',
    sourceDuration: 10,
    sourceStart: 20,
    startTime: 0,
    trackId: 'track-audio',
    transform: createBaseTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.AUDIO,
    volume: 1,
    ...overrides,
  };
}

function createShapeClip(overrides: Partial<VideoProjectShapeClip> = {}): VideoProjectShapeClip {
  return {
    duration: 5,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: 'shape-group',
    id: 'shape-1',
    linkMode: VideoClipLinkMode.LINKED,
    muted: false,
    name: 'Shape',
    shapeType: VideoProjectShapeType.RECTANGLE,
    startTime: 1,
    style: {
      borderRadius: 0,
      fillColor: '#fff',
      strokeColor: '#000',
      strokeWidth: 1,
    },
    trackId: 'track-overlay',
    transform: createBaseTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.SHAPE,
    volume: 1,
    ...overrides,
  };
}

describe('video project timeline overwrite segments helpers', () => {
  it('merges overlapping and nearly-adjacent clip ranges', () => {
    expect(
      mergeClipTimeRanges([
        { end: 3, start: 1 },
        { end: 6, start: 2.99995 },
        { end: 9, start: 8.5 },
        { end: 12, start: 10 },
      ])
    ).toEqual([
      { end: 6, start: 1 },
      { end: 9, start: 8.5 },
      { end: 12, start: 10 },
    ]);
  });

  it('returns an empty range list when no clip ranges are provided', () => {
    expect(mergeClipTimeRanges([])).toEqual([]);
  });

  it(
    'splits linked media clips into shared segment groups and preserves source offsets',
    verifySplitLinkedMediaClips
  );

  it('keeps non-media clips intact when overwrite does not split them', verifyKeepShapeClip);

  it('drops fully overwritten or sub-threshold remainder segments', verifyTrimmedSegments);
});

function verifySplitLinkedMediaClips(): void {
  const randomUUIDSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
  let uuidIndex = 0;
  randomUUIDSpy.mockImplementation(() => createUuid(++uuidIndex));
  const removals: ClipTimeRange[] = [{ end: 8, start: 2 }];
  const groupIds = new Map<string, string>();

  const videoSegments = splitClipAfterOverwrite(
    createVideoClip({
      groupId: 'linked-group',
      linkMode: VideoClipLinkMode.LINKED,
    }),
    removals,
    groupIds
  );
  const audioSegments = splitClipAfterOverwrite(
    createAudioClip({
      groupId: 'linked-group',
      linkMode: VideoClipLinkMode.LINKED,
    }),
    removals,
    groupIds
  );

  verifyVideoSegments(videoSegments);
  verifyAudioSegments(audioSegments);
}

function verifyKeepShapeClip(): void {
  const clip = createShapeClip();

  expect(
    splitClipAfterOverwrite(clip, [{ end: 20, start: 15 }], new Map<string, string>())
  ).toEqual([
    expect.objectContaining({
      duration: 5,
      groupId: 'shape-group',
      id: 'shape-1',
      startTime: 1,
    }),
  ]);
}

function verifyTrimmedSegments(): void {
  expect(
    splitClipAfterOverwrite(createVideoClip(), [{ end: 10, start: 0 }], new Map<string, string>())
  ).toEqual([]);

  expect(
    splitClipAfterOverwrite(createVideoClip(), [{ end: 9.95, start: 0 }], new Map<string, string>())
  ).toEqual([]);
}

function verifyVideoSegments(videoSegments: unknown[]): void {
  expect(videoSegments).toEqual([
    expect.objectContaining({
      duration: 2,
      groupId: createUuid(1),
      id: 'video-1',
      sourceDuration: 2,
      sourceStart: 5,
      startTime: 0,
    }),
    expect.objectContaining({
      duration: 2,
      groupId: createUuid(2),
      id: createUuid(3),
      sourceDuration: 2,
      sourceStart: 13,
      startTime: 8,
    }),
  ]);
}

function verifyAudioSegments(audioSegments: unknown[]): void {
  expect(audioSegments).toEqual([
    expect.objectContaining({
      duration: 2,
      groupId: createUuid(1),
      id: 'audio-1',
      sourceDuration: 2,
      sourceStart: 20,
      startTime: 0,
    }),
    expect.objectContaining({
      duration: 2,
      groupId: createUuid(2),
      id: createUuid(4),
      sourceDuration: 2,
      sourceStart: 28,
      startTime: 8,
    }),
  ]);
}

function createUuid(index: number): `${string}-${string}-${string}-${string}-${string}` {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
