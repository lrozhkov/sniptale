import { expect, it } from 'vitest';
import { resolveSceneBackgroundAudioEnvelope } from './background-audio';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoTimelinePlacementMode,
  VideoTrackKind,
  type VideoProjectAudioClip,
  type VideoProjectAsset,
  type VideoProject,
} from '../types/index';

function createAudioAsset(
  overrides: Partial<VideoProjectAsset['metadata']> = {}
): VideoProjectAsset {
  return {
    createdAt: 0,
    id: 'audio-asset',
    metadata: {
      audioPeaks: [0, 0.5, 1, 0.25],
      duration: 4,
      hasAudio: true,
      height: 0,
      mimeType: 'audio/webm',
      size: 1,
      width: 0,
      ...overrides,
    },
    name: 'Audio',
    source: { kind: 'recording', recordingId: 'recording-1' },
    type: VideoProjectAssetType.AUDIO,
  };
}

function createAudioClip(overrides: Partial<VideoProjectAudioClip> = {}): VideoProjectAudioClip {
  return {
    assetId: 'audio-asset',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'audio-clip',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Audio',
    playbackRate: 1,
    sourceDuration: 4,
    sourceStart: 0,
    startTime: 0,
    trackId: 'audio-track',
    transform: { height: 0, opacity: 1, rotation: 0, width: 0, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.AUDIO,
    volume: 0.5,
    volumeEnvelopeEnd: 1,
    volumeEnvelopeStart: 1,
    ...overrides,
  };
}

function createProject(
  params: {
    asset?: VideoProjectAsset;
    clip?: VideoProjectAudioClip;
  } = {}
): VideoProject {
  return {
    assets: [params.asset ?? createAudioAsset()],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips: [params.clip ?? createAudioClip()],
    createdAt: 0,
    duration: 4,
    fps: 30,
    height: 720,
    id: 'project',
    motionRegions: [],
    name: 'Project',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.OVERWRITE,
    tracks: [
      {
        id: 'audio-track',
        kind: VideoTrackKind.AUDIO,
        locked: false,
        name: 'Audio',
        order: 0,
        visible: true,
      },
    ],
    transitions: [],
    updatedAt: 0,
    version: 2,
    width: 1280,
    actionEvents: [],
    cursorTrack: null,
  };
}

it('resolves a deterministic background audio envelope from explicit transient peaks', () => {
  expect(resolveSceneBackgroundAudioEnvelope(createProject(), 2)).toBeCloseTo(0.49, 1);
});

it('ignores monotone music beds without pronounced transient peaks', () => {
  const asset = createAudioAsset({ audioPeaks: [0.62, 0.62, 0.62, 0.62, 0.62] });

  expect(resolveSceneBackgroundAudioEnvelope(createProject({ asset }), 2)).toBe(0);
});

it('returns zero for inactive clips and assets without usable peak data', () => {
  expect(
    resolveSceneBackgroundAudioEnvelope(
      createProject({ clip: createAudioClip({ startTime: 5 }) }),
      2
    )
  ).toBe(0);
  expect(
    resolveSceneBackgroundAudioEnvelope(
      createProject({ asset: createAudioAsset({ audioPeaks: null }) }),
      2
    )
  ).toBe(0);
});

it('returns zero when no audible peak data is active', () => {
  const project = createProject();
  project.clips[0] = { ...project.clips[0]!, muted: true };

  expect(resolveSceneBackgroundAudioEnvelope(project, 2)).toBe(0);
});

it('returns zero for partial harness projects without clips', () => {
  expect(resolveSceneBackgroundAudioEnvelope({ assets: [] } as never, 2)).toBe(0);
});
