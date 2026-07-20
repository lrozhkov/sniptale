import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyOverwritePlacement } from './overwrite.helpers.ts';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  type VideoProjectAudioClip,
  type VideoProjectClip,
  type VideoProject,
  VideoProjectClipType,
  type VideoProjectVideoClip,
  VideoTimelinePlacementMode,
  VideoTrackKind,
} from '../types/index';

function createTransform() {
  return {
    height: 720,
    opacity: 1,
    rotation: 0,
    width: 1280,
    x: 0,
    y: 0,
  };
}

function createTrack(id: string, kind: VideoTrackKind, order: number) {
  return {
    id,
    kind,
    locked: false,
    name: `${kind}-${order}`,
    order,
    visible: true,
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
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Clip',
    sourceDuration: 10,
    sourceStart: 0,
    startTime: 0,
    trackId: 'track-video',
    transform: createTransform(),
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
    sourceStart: 10,
    startTime: 0,
    trackId: 'track-audio',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.AUDIO,
    volume: 1,
    ...overrides,
  };
}

function createProject(clips: VideoProjectClip[]): VideoProject {
  return {
    assets: [],
    backgroundColor: '#000',
    baseRecordingId: null,
    source: { kind: 'manual' },
    clips,
    createdAt: 10,
    duration: 20,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Demo',
    timelinePlacementMode: VideoTimelinePlacementMode.OVERWRITE,
    tracks: [
      createTrack('track-video', VideoTrackKind.PRIMARY, 0),
      createTrack('track-audio', VideoTrackKind.AUDIO, 1),
    ],
    updatedAt: 20,
    version: 2,
    width: 1280,
    cursorTrack: null,
    actionEvents: [],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('video project timeline overwrite helpers', () => {
  it('returns the original project when there are no anchor clips', verifyMissingAnchors);

  it('returns the original project when anchors do not overlap any clips', verifyNoOverlap);

  it(
    'splits overlapping clips around the anchor range and updates the timestamp',
    verifySimpleOverwriteSplit
  );

  it(
    'propagates overwrite removals to linked clips on sibling tracks',
    verifyLinkedOverwritePropagation
  );
});

function verifyMissingAnchors(): void {
  const project = createProject([createVideoClip()]);

  expect(applyOverwritePlacement(project, ['missing-anchor'])).toBe(project);
}

function verifyNoOverlap(): void {
  const project = createProject([
    createVideoClip({ duration: 2, id: 'anchor', startTime: 10 }),
    createVideoClip({ duration: 3, id: 'existing', startTime: 0 }),
  ]);

  expect(applyOverwritePlacement(project, ['anchor'])).toBe(project);
}

function verifySimpleOverwriteSplit(): void {
  vi.spyOn(Date, 'now').mockReturnValue(1234);
  const randomUUIDSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
  randomUUIDSpy.mockReturnValue(createUuid(10));

  const project = createProject([
    createVideoClip({
      duration: 2,
      id: 'anchor',
      startTime: 4,
    }),
    createVideoClip({
      duration: 10,
      id: 'existing',
      startTime: 0,
    }),
  ]);

  const result = applyOverwritePlacement(project, ['anchor']);

  expect(result).toEqual({
    ...project,
    clips: [
      expect.objectContaining({
        duration: 2,
        id: 'anchor',
        startTime: 4,
      }),
      expect.objectContaining({
        duration: 4,
        id: 'existing',
        startTime: 0,
      }),
      expect.objectContaining({
        duration: 4,
        id: createUuid(10),
        startTime: 6,
      }),
    ],
    updatedAt: 1234,
  });
  expect(result.clips).not.toBe(project.clips);
}

function verifyLinkedOverwritePropagation(): void {
  vi.spyOn(Date, 'now').mockReturnValue(777);
  const randomUUIDSpy = vi.spyOn(globalThis.crypto, 'randomUUID');
  const uuids = [createUuid(1), createUuid(2), createUuid(3), createUuid(4)];
  randomUUIDSpy.mockImplementation(() => uuids.shift() ?? createUuid(99));

  const project = createProject([
    createVideoClip({
      duration: 2,
      id: 'anchor',
      startTime: 4,
    }),
    createVideoClip({
      duration: 10,
      groupId: 'linked-group',
      id: 'linked-video',
      linkMode: VideoClipLinkMode.LINKED,
      startTime: 0,
    }),
    createAudioClip({
      groupId: 'linked-group',
      id: 'linked-audio',
      linkMode: VideoClipLinkMode.LINKED,
    }),
  ]);

  const result = applyOverwritePlacement(project, ['anchor']);
  const linkedVideoSegments = result.clips.filter(
    (clip) => clip.id !== 'anchor' && clip.trackId === 'track-video'
  );
  const linkedAudioSegments = result.clips.filter((clip) => clip.trackId === 'track-audio');

  verifyLinkedVideoSegments(linkedVideoSegments);
  verifyLinkedAudioSegments(linkedAudioSegments);
  expect(result.updatedAt).toBe(777);
}

function verifyLinkedVideoSegments(linkedVideoSegments: VideoProject['clips']): void {
  expect(linkedVideoSegments).toEqual([
    expect.objectContaining({
      duration: 4,
      groupId: createUuid(1),
      id: 'linked-video',
      startTime: 0,
    }),
    expect.objectContaining({
      duration: 4,
      groupId: createUuid(2),
      id: createUuid(3),
      startTime: 6,
    }),
  ]);
}

function verifyLinkedAudioSegments(linkedAudioSegments: VideoProject['clips']): void {
  expect(linkedAudioSegments).toEqual([
    expect.objectContaining({
      duration: 4,
      groupId: createUuid(1),
      id: 'linked-audio',
      sourceStart: 10,
      startTime: 0,
    }),
    expect.objectContaining({
      duration: 4,
      groupId: createUuid(2),
      id: createUuid(4),
      sourceStart: 16,
      startTime: 6,
    }),
  ]);
}

function createUuid(index: number): `${string}-${string}-${string}-${string}-${string}` {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}
