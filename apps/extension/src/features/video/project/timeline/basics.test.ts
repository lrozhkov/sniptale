import { describe, expect, it, vi } from 'vitest';
import {
  calculateProjectDuration,
  clampNumber,
  getAssetById,
  getClipById,
  getClipEndTime,
  getClipGainRange,
  normalizeClipPlaybackRate,
  getSortedTracks,
  getTrackById,
  getTrackClips,
  syncProjectDuration,
} from './basics';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  type VideoProject,
  type VideoProjectAsset,
  VideoProjectAssetType,
  type VideoProjectAudioClip,
  type VideoProjectClip,
  VideoProjectClipType,
  type VideoProjectImageClip,
  type VideoProjectTrack,
  type VideoProjectVideoClip,
  VideoTimelinePlacementMode,
  VideoTrackKind,
  VideoTransitionKind,
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
function createTrack(id: string, kind: VideoTrackKind, order: number): VideoProjectTrack {
  return {
    id,
    kind,
    locked: false,
    name: `${kind}-${order}`,
    order,
    visible: true,
  };
}
function createAsset(
  id: string,
  type: VideoProjectAssetType,
  overrides: Partial<VideoProjectAsset> = {}
): VideoProjectAsset {
  return {
    createdAt: 1,
    id,
    metadata: {
      audioPeaks: [0.1, 0.3, 0.9, 0.4],
      duration: 20,
      hasAudio: true,
      height: 720,
      mimeType: 'video/webm',
      size: 100,
      width: 1280,
    },
    name: id,
    source: {
      kind: 'recording',
      recordingId: `recording-${id}`,
    },
    type,
    ...overrides,
  };
}
function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    assetId: 'asset-video',
    duration: 6,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-video',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Video',
    sourceDuration: 6,
    sourceStart: 2,
    startTime: 4,
    timelineLaneId: 'line-1',
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
    assetId: 'asset-audio',
    duration: 6,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'clip-audio',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Audio',
    sourceDuration: 6,
    sourceStart: 5,
    startTime: 3,
    trackId: 'track-audio',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.AUDIO,
    volume: 0.8,
    ...overrides,
  };
}
function createImageClip(overrides: Partial<VideoProjectImageClip> = {}): VideoProjectImageClip {
  return {
    assetId: 'asset-image',
    duration: 3,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.COVER,
    groupId: null,
    id: 'clip-image',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Image',
    startTime: 8,
    timelineLaneId: 'line-1',
    trackId: 'track-video',
    transform: createTransform(),
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.IMAGE,
    volume: 1,
    ...overrides,
  };
}
function createProject(
  clips: VideoProjectClip[] = [createVideoClip(), createAudioClip(), createImageClip()]
): VideoProject {
  return {
    assets: createProjectAssets(),
    backgroundColor: '#000',
    baseRecordingId: null,
    source: { kind: 'manual' },
    clips,
    createdAt: 1,
    duration: 0,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Demo',
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    tracks: [
      createTrack('track-audio', VideoTrackKind.AUDIO, 1),
      createTrack('track-video', VideoTrackKind.PRIMARY, 0),
    ],
    updatedAt: 2,
    version: 2,
    width: 1280,
    cursorTrack: null,
    actionEvents: [],
  };
}
function createProjectAssets(): VideoProjectAsset[] {
  return [
    createAsset('asset-video', VideoProjectAssetType.VIDEO),
    createAudioAsset(),
    createImageAsset(),
  ];
}
function createAudioAsset(): VideoProjectAsset {
  return createAsset('asset-audio', VideoProjectAssetType.AUDIO, {
    metadata: {
      audioPeaks: [0.2, 0.4, 0.6, 0.8],
      duration: 12,
      hasAudio: true,
      height: 0,
      mimeType: 'audio/webm',
      size: 50,
      width: 0,
    },
  });
}
function createImageAsset(): VideoProjectAsset {
  return createAsset('asset-image', VideoProjectAssetType.IMAGE, {
    metadata: {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 720,
      mimeType: 'image/png',
      size: 25,
      width: 1280,
    },
  });
}
describe('video project timeline basics', () => {
  it('resolves clamp, track sorting and entity lookups', verifyLookups);
  it('calculates and syncs project duration', verifyDurationSync);
});
function verifyLookups(): void {
  const project = createProject();
  expect(clampNumber(-1, 0, 10)).toBe(0);
  expect(clampNumber(15, 0, 10)).toBe(10);
  expect(getSortedTracks(project).map((track) => track.id)).toEqual(['track-video', 'track-audio']);
  expect(getTrackById(project, 'track-video')?.kind).toBe(VideoTrackKind.PRIMARY);
  expect(getClipById(project, 'clip-video')?.type).toBe(VideoProjectClipType.VIDEO);
  expect(getAssetById(project, 'asset-image')?.type).toBe(VideoProjectAssetType.IMAGE);
  expect(getClipEndTime(createVideoClip())).toBe(10);
  expect(getTrackClips(project, 'track-video').map((clip) => clip.id)).toEqual([
    'clip-video',
    'clip-image',
  ]);
  expect(normalizeClipPlaybackRate(8)).toBe(8);
  expect(normalizeClipPlaybackRate(-1)).toBe(1);
  expect(getClipGainRange({ volume: 0.5, volumeEnvelopeStart: 1.5 } as VideoProjectClip)).toEqual({
    start: 0.75,
    end: 0.5,
  });
  expect(
    getClipGainRange({ audioGainStart: 1.2, audioGainEnd: 0.8, volume: 0.5 } as VideoProjectClip)
  ).toEqual({ start: 1.2, end: 0.8 });
}
function verifyDurationSync(): void {
  vi.spyOn(Date, 'now').mockReturnValue(77);
  const project = createProject();
  expect(calculateProjectDuration(project)).toBe(11);
  expect(syncProjectDuration(project)).toEqual(
    expect.objectContaining({
      duration: 11,
      transitions: [
        expect.objectContaining({
          kind: VideoTransitionKind.CROSSFADE,
          leadingClipId: 'clip-video',
          trailingClipId: 'clip-image',
        }),
      ],
      updatedAt: 77,
    })
  );
  const overlapProject = createProject([
    createVideoClip({
      duration: 5,
      id: 'clip-a',
      startTime: 0,
      transitionOut: VideoClipTransitionKind.CROSSFADE,
    }),
    createImageClip({
      duration: 3,
      id: 'clip-b',
      startTime: 4,
      transitionIn: VideoClipTransitionKind.CROSSFADE,
    }),
  ]);
  const syncedOverlapProject = syncProjectDuration(overlapProject);
  expect(syncedOverlapProject.transitions).toHaveLength(1);
  expect(calculateProjectDuration(createProject([]))).toBe(0);
}
