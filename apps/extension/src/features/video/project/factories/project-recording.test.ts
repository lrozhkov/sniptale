import { expect, it } from 'vitest';
import { resolveVideoCompositionFrame } from '../../composition/timeline/frame';

import { createVideoProjectFromRecording } from './creation';
import { createRecordingProjectDocument } from './project-recording';
import {
  VideoCursorCaptureMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectAssetType,
  VideoProjectClipType,
  VideoProjectTrackRole,
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
  expect(project.tracks.map((track) => track.kind)).toEqual([VideoTrackKind.PRIMARY]);
});

it('anchors recording interactions to the independent source clip', () => {
  const project = createVideoProjectFromRecording({
    actionEvents: [
      {
        data: {},
        duration: 0,
        id: 'click-1',
        kind: VideoProjectActionEventKind.CLICK,
        label: 'Click',
        point: { x: 10, y: 20 },
        preset: VideoProjectActionPreset.CLICK_RIPPLE,
        time: 2,
      },
      {
        data: {},
        duration: 0,
        id: 'manual-click',
        kind: VideoProjectActionEventKind.CLICK,
        label: 'Manual click',
        point: null,
        preset: VideoProjectActionPreset.CLICK_RIPPLE,
        time: 3,
        timeBasis: 'project',
      },
    ],
    cursorTrack: {
      captureMode: VideoCursorCaptureMode.SEPARATE,
      samples: [
        { id: 'cursor-1', time: 1, visible: true, x: 10, y: 20 },
        {
          id: 'manual-cursor',
          time: 3,
          timeBasis: 'project',
          visible: true,
          x: 30,
          y: 40,
        },
      ],
      skin: {
        animationPreset: 'NONE',
        color: '#fff',
        hidden: false,
        preset: 'ARROW',
        scale: 1,
        shadow: true,
      },
    },
    duration: 4,
    filename: 'anchored.webm',
    height: 720,
    mimeType: 'video/webm',
    recordingId: 'rec-anchored',
    size: 1024,
    width: 1280,
  });
  const sourceClipId = project.clips.find((clip) => clip.type === VideoProjectClipType.VIDEO)?.id;

  expect(project.actionEvents[0]?.sourceAnchor).toEqual({
    kind: 'recording-source',
    recordingId: 'rec-anchored',
    sourceClipId,
    sourceTime: 2,
  });
  expect(project.cursorTrack?.samples[0]?.sourceAnchor).toEqual({
    kind: 'recording-source',
    recordingId: 'rec-anchored',
    sourceClipId,
    sourceTime: 1,
  });
  expect(project.actionEvents[1]).not.toHaveProperty('sourceAnchor');
  expect(project.cursorTrack?.samples[1]).not.toHaveProperty('sourceAnchor');
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
  expect(
    project.tracks
      .filter((track) => track.kind === VideoTrackKind.PRIMARY)
      .map((track) => track.order)
  ).toEqual([1, 2]);
  expect(project.tracks.some((track) => track.role !== undefined)).toBe(false);
});

it('creates an explicitly independent camera track with a safe overlay placement', () => {
  const project = createProjectWithSidecarRecording(VideoProjectTrackRole.CAMERA);
  const cameraTrack = project.tracks.find((track) => track.role === VideoProjectTrackRole.CAMERA);
  const cameraClip = project.clips.find((clip) => clip.trackId === cameraTrack?.id);

  expect(cameraTrack).toEqual(expect.objectContaining({ kind: VideoTrackKind.PRIMARY }));
  expect(cameraClip).toEqual(
    expect.objectContaining({
      muted: true,
      transform: expect.objectContaining({
        height: expect.any(Number),
        width: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    })
  );
  expect(cameraClip?.transform.width).toBeLessThan(project.width / 2);
  expect(cameraClip?.transform.x).toBeGreaterThan(project.width / 2);
  const screenClip = project.clips.find(
    (clip) => clip.type === VideoProjectClipType.VIDEO && clip.assetId === 'asset-main'
  );
  const frame = resolveVideoCompositionFrame(project, 1);
  const screenLayer = frame.visualLayers.find((layer) => layer.clipId === screenClip?.id);
  const cameraLayer = frame.visualLayers.find((layer) => layer.clipId === cameraClip?.id);
  expect(cameraTrack?.order).toBeGreaterThan(0);
  expect(cameraTrack?.order).toBeLessThan(1);
  expect(cameraLayer?.zIndex).toBeGreaterThan(screenLayer?.zIndex ?? -1);
});

function createProjectWithSidecarRecording(trackRole?: VideoProjectTrackRole) {
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
        ...(trackRole ? { trackRole } : {}),
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
