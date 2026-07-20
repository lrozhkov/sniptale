import { expect, it } from 'vitest';

import { createVideoProjectFromRecording } from './creation';
import { createRecordingProjectDocument } from './project-recording';
import {
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoTrackKind,
  type VideoProjectAsset,
} from '../types/index';

function createRecordingAsset(overrides: Partial<VideoProjectAsset> = {}): VideoProjectAsset {
  return {
    id: 'asset-main',
    type: VideoProjectAssetType.RECORDING,
    name: 'custom.webm',
    source: { kind: 'recording', recordingId: 'rec-main' },
    metadata: {
      width: 1920,
      height: 1080,
      duration: 4,
      mimeType: 'video/webm',
      size: 4096,
      hasAudio: true,
      audioPeaks: [0.25, 0.75],
    },
    createdAt: 123,
    ...overrides,
  };
}

it('creates a silent recording project and clamps tiny source duration', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'rec-silent',
    filename: 'silent.webm',
    width: 1280,
    height: 720,
    duration: 0,
    mimeType: 'video/webm',
    size: 1024,
  });

  expect(project.name).toBe('silent');
  expect(project.duration).toBe(0.1);
  expect(project.baseRecordingId).toBe('rec-silent');
  expect(project.assets).toHaveLength(1);
  expect(project.clips.map((clip) => clip.type)).toEqual([VideoProjectClipType.VIDEO]);
  expect(project.tracks.map((track) => track.kind)).toEqual([
    VideoTrackKind.PRIMARY,
    VideoTrackKind.AUDIO,
    VideoTrackKind.OVERLAY,
  ]);
});

it('keeps provided recording assets, audio clips, and sidecar tracks together', () => {
  const project = createProjectWithSidecarRecording();

  expect(project.assets.map((asset) => asset.id)).toEqual(['asset-main', 'asset-sidecar']);
  expect(project.clips.map((clip) => clip.type)).toEqual([
    VideoProjectClipType.VIDEO,
    VideoProjectClipType.AUDIO,
    VideoProjectClipType.VIDEO,
  ]);
  expect(project.clips[0]).toEqual(expect.objectContaining({ muted: true }));
  expect(project.clips[1]?.groupId).toBe(project.clips[0]?.groupId);
  expect(project.tracks.filter((track) => track.kind === VideoTrackKind.PRIMARY)).toHaveLength(2);
});

function createProjectWithSidecarRecording() {
  const sidecarAsset = createRecordingAsset({
    id: 'asset-sidecar',
    name: 'camera.webm',
    source: { kind: 'recording', recordingId: 'rec-camera' },
    metadata: {
      width: 640,
      height: 360,
      duration: 3,
      mimeType: 'video/webm',
      size: 2048,
      hasAudio: false,
      audioPeaks: null,
    },
  });

  return createVideoProjectFromRecording({
    recordingId: 'rec-main',
    filename: 'main.webm',
    width: 1920,
    height: 1080,
    duration: 4,
    mimeType: 'video/webm',
    size: 4096,
    hasAudio: true,
    audioPeaks: [0.25, 0.75],
    actionEvents: [],
    asset: createRecordingAsset(),
    sidecarVideos: [
      {
        recordingId: 'rec-camera',
        filename: 'camera.webm',
        width: 640,
        height: 360,
        duration: 3,
        mimeType: 'video/webm',
        size: 2048,
        asset: sidecarAsset,
      },
    ],
  });
}

it('omits optional motion regions when recording metadata has none', () => {
  const project = createRecordingProjectDocument({
    actionEvents: [],
    asset: createRecordingAsset(),
    clips: [],
    cursorTrack: null,
    motionRegions: undefined,
    options: {
      filename: 'capture.webm',
      height: 720,
      recordingId: 'rec-main',
      width: 1280,
    },
    sidecarAssets: [],
    tracks: [],
  });

  expect(project).not.toHaveProperty('motionRegions');
  expect(project.duration).toBe(0.1);
});
