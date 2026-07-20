import { expect, it } from 'vitest';
import { clampClipPlaybackRate } from './index';
import { createVideoProjectFromRecording } from '../factories/creation';
import {
  getClipWaveformPeaks,
  getLinkedClipIds,
  getSourceTimedClipProjectDuration,
  getSourceTimedClipProjectOffset,
  getSourceTimedClipSourceOffset,
} from './basics';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  type VideoProjectClip,
  type VideoProjectAsset,
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoTimelinePlacementMode,
  VideoTrackKind,
  type VideoProject,
} from '../types/index';

function createVideoAsset(): VideoProjectAsset {
  return {
    createdAt: 1,
    id: 'asset-video',
    metadata: {
      audioPeaks: [0.1, 0.3, 0.9, 0.4],
      duration: 20,
      hasAudio: true,
      height: 720,
      mimeType: 'video/webm',
      size: 100,
      width: 1280,
    },
    name: 'asset-video',
    source: { kind: 'recording', recordingId: 'recording-asset-video' },
    type: VideoProjectAssetType.VIDEO,
  };
}

function createTrack(id: string, kind: VideoTrackKind, order: number, name: string) {
  return { id, kind, locked: false, name, order, visible: true } as const;
}

function createLinkedVideoClip(trackId: string) {
  return {
    assetId: 'asset-video',
    duration: 6,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: 'group-1',
    id: 'linked-video',
    linkMode: VideoClipLinkMode.LINKED,
    muted: false,
    name: 'Video',
    sourceDuration: 6,
    sourceStart: 2,
    startTime: 4,
    trackId,
    transform: { x: 0, y: 0, width: 1280, height: 720, rotation: 0, opacity: 1 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  } as const;
}

function createLinkedAudioClip(trackId: string) {
  return {
    assetId: 'asset-video',
    duration: 6,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: 'group-1',
    id: 'linked-audio',
    linkMode: VideoClipLinkMode.LINKED,
    muted: false,
    name: 'Audio',
    sourceDuration: 6,
    sourceStart: 5,
    startTime: 3,
    trackId,
    transform: { x: 0, y: 0, width: 0, height: 0, rotation: 0, opacity: 1 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.AUDIO,
    volume: 0.8,
  } as const;
}

function createImageClip(trackId: string): VideoProjectClip {
  return {
    assetId: 'asset-video',
    duration: 2,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'image-clip',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Image',
    startTime: 1,
    trackId,
    transform: { x: 0, y: 0, width: 1280, height: 720, rotation: 0, opacity: 1 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.IMAGE,
    volume: 1,
  };
}

function createProject(): VideoProject {
  const audioTrack = createTrack('track-audio', VideoTrackKind.AUDIO, 1, 'Audio');
  const videoTrack = createTrack('track-video', VideoTrackKind.PRIMARY, 0, 'Video');

  return {
    actionEvents: [],
    assets: [createVideoAsset()],
    backgroundColor: '#000',
    baseRecordingId: null,
    clips: [createLinkedVideoClip(videoTrack.id), createLinkedAudioClip(audioTrack.id)],
    createdAt: 1,
    cursorTrack: null,
    duration: 0,
    fps: 30,
    height: 720,
    id: 'project-1',
    name: 'Demo',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.RIPPLE_PUSH,
    tracks: [audioTrack, videoTrack],
    updatedAt: 2,
    version: 2,
    width: 1280,
  };
}

it('derives waveform peaks and linked clip ids for linked media clips', () => {
  const project = createProject();
  const linkedVideo = project.clips[0]!;
  const linkedAudio = project.clips[1]!;

  expect(getClipWaveformPeaks(project, linkedVideo, 4)).toEqual([
    0.1, 0.1, 0.1, 0.1, 0.3, 0.3, 0.3, 0.3,
  ]);
  expect(getClipWaveformPeaks(project, linkedAudio, 999)).toHaveLength(160);
  expect(getLinkedClipIds(project, 'linked-video')).toEqual(['linked-video', 'linked-audio']);
});

it('returns empty waveform data for unsupported clips and missing asset metadata', () => {
  const project = createProject();
  const imageClip = createImageClip(project.tracks[1]!.id);

  expect(getClipWaveformPeaks(project, imageClip, 4)).toEqual([]);
  expect(getClipWaveformPeaks(project, project.clips[0]!, 0)).toEqual([]);
  expect(
    getClipWaveformPeaks(
      {
        ...project,
        assets: [
          { ...project.assets[0]!, metadata: { ...project.assets[0]!.metadata, audioPeaks: null } },
        ],
      },
      project.clips[0]!,
      16
    )
  ).toEqual([]);
  expect(getLinkedClipIds(project, 'missing-clip')).toEqual([]);
  expect(
    getLinkedClipIds(
      {
        ...project,
        clips: [{ ...project.clips[0]!, groupId: null, linkMode: VideoClipLinkMode.DETACHED }],
      },
      'linked-video'
    )
  ).toEqual(['linked-video']);
});

it('maps source-timed clip offsets and recording defaults for retimed clips', () => {
  expect(clampClipPlaybackRate(Number.NaN)).toBe(1);
  expect(getSourceTimedClipProjectDuration({ playbackRate: 2, sourceDuration: 6 })).toBe(3);
  expect(getSourceTimedClipProjectOffset({ playbackRate: 2, sourceDuration: 6 }, 4)).toBe(2);
  expect(getSourceTimedClipSourceOffset({ duration: 3, playbackRate: 2 }, -1)).toBe(-2);
  expect(
    createVideoProjectFromRecording({
      duration: 6,
      filename: 'capture.webm',
      hasAudio: true,
      height: 720,
      mimeType: 'video/webm',
      recordingId: 'recording-1',
      size: 1024,
      width: 1280,
    }).clips.every((clip) => ('playbackRate' in clip ? clip.playbackRate === 1 : true))
  ).toBe(true);
});
