import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIDEO_PROJECT_BACKGROUND,
  createVideoProjectCursorTrack,
  createVideoProjectSource,
} from './defaults';
import { clampNumber } from './hydration';
import {
  createClipGroupId,
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectFromRecording,
  createVideoProjectTrack,
  getDefaultTrackName,
  resolveVideoOverlayTrack,
} from './factories/creation';
import { createSubtitleClip, createTextClip } from './factories/overlay-clip';
import { createFittedTransform } from './factories/clip';
import { createVideoProjectMotionRegion } from './motion/index';
import { getDefaultExportSettings } from './timeline';
import {
  VideoCursorCaptureMode,
  VideoProjectAssetType,
  VideoProjectTrackRole,
  VideoProjectClipType,
  VideoSceneBackgroundKind,
  VideoProjectSourceKind,
  VideoTimelinePlacementMode,
  VideoTrackKind,
} from './types';

describe('video-project math helpers', () => {
  it('clamps numeric values to the requested range', () => {
    expect(clampNumber(-5, 0, 10)).toBe(0);
    expect(clampNumber(12, 0, 10)).toBe(10);
    expect(clampNumber(4, 0, 10)).toBe(4);
  });

  it('creates a centered fitted transform that preserves aspect ratio', () => {
    expect(createFittedTransform(100, 50, 200, 200)).toEqual({
      x: 0,
      y: 50,
      width: 200,
      height: 100,
      rotation: 0,
      opacity: 1,
    });
  });
});

describe('empty project factory', () => {
  it('creates an empty project with the default track layout', () => {
    const project = createEmptyVideoProject('Demo', 1280, 720);

    expect(project.name).toBe('Demo');
    expect(project.width).toBe(1280);
    expect(project.height).toBe(720);
    expect(project.backgroundColor).toBe(DEFAULT_VIDEO_PROJECT_BACKGROUND);
    expect(project.sceneBackground).toEqual({
      kind: VideoSceneBackgroundKind.SOLID,
      color: DEFAULT_VIDEO_PROJECT_BACKGROUND,
    });
    expect(project.timelinePlacementMode).toBe(VideoTimelinePlacementMode.RIPPLE_PUSH);
    expect(project.duration).toBe(0);
    expect(project.source).toEqual({ kind: VideoProjectSourceKind.MANUAL });
    expect(project.cursorTrack).toBeNull();
    expect(project.actionEvents).toEqual([]);
    expect(project.motionRegions).toEqual([]);
    expect(project.tracks).toHaveLength(1);
    expect(project.tracks.map((track) => track.kind)).toEqual([VideoTrackKind.PRIMARY]);
    expect(project.tracks.every((track) => track.isRoot === true)).toBe(true);
  });
});

describe('recording project factories', () => {
  it('creates linked recording clips when the source recording has audio', () => {
    expectRecordingProjectShape(
      createVideoProjectFromRecording({
        recordingId: 'rec-1',
        filename: 'demo.webm',
        width: 1920,
        height: 1080,
        duration: 12.5,
        mimeType: 'video/webm',
        size: 1024,
        hasAudio: true,
        audioPeaks: [0.1, 0.5, 1],
      })
    );
  });

  it(
    'creates manual and recording source defaults plus a separate cursor track by default',
    verifyDefaultSourceFactories
  );

  it(
    'covers shared project factories and branchy defaults from the public facade',
    verifySharedProjectFacadeBranches
  );
});

function verifyDefaultSourceFactories() {
  const project = createEmptyVideoProject('Motion source', 1440, 900);
  const cursorTrack = createVideoProjectCursorTrack();

  expect(createVideoProjectSource(null)).toEqual({ kind: VideoProjectSourceKind.MANUAL });
  expect(createVideoProjectSource('rec-2')).toEqual({
    kind: VideoProjectSourceKind.RECORDING,
    recordingId: 'rec-2',
  });
  expect(createVideoProjectMotionRegion(project, 1)).toEqual(
    expect.objectContaining({
      focusPoint: { x: 720, y: 450 },
      startTime: 1,
    })
  );
  expect(cursorTrack).toEqual(
    expect.objectContaining({
      captureMode: VideoCursorCaptureMode.SEPARATE,
      samples: [],
      skin: expect.objectContaining({
        color: '#f5f0e6',
      }),
    })
  );
}

function verifySharedProjectFacadeBranches() {
  verifySharedTrackAndAssetFactories();
  verifySharedRecordingProjectOverrides();
}

function verifySharedTrackAndAssetFactories() {
  expect(createClipGroupId()).toEqual(expect.any(String));
  expect(getDefaultTrackName(VideoTrackKind.PRIMARY, 2)).toContain('2');
  expect(getDefaultTrackName(VideoTrackKind.AUDIO, 3)).toContain('3');
  expect(getDefaultTrackName(VideoTrackKind.PRIMARY, 1)).toContain('1');
  expect(getDefaultTrackName(VideoTrackKind.PRIMARY, 2)).toContain('2');
  expect(getDefaultTrackName(VideoTrackKind.SUBTITLE, 2)).toContain('2');
  expect(createVideoProjectTrack('Extra overlay', 4, VideoTrackKind.PRIMARY)).toEqual(
    expect.objectContaining({
      isRoot: false,
      kind: VideoTrackKind.PRIMARY,
      locked: false,
      name: 'Extra overlay',
      order: 4,
      visible: true,
    })
  );
  expect(createVideoProjectTrack('Subtitles', 5, VideoTrackKind.SUBTITLE)).toEqual(
    expect.objectContaining({
      kind: VideoTrackKind.SUBTITLE,
      subtitleStyle: expect.objectContaining({
        placement: 'BOTTOM',
      }),
    })
  );
  expect(
    createVideoProjectAsset(
      'Demo clip',
      VideoProjectAssetType.VIDEO,
      { kind: 'project-asset', projectAssetId: 'asset-1' },
      {
        duration: 4,
        hasAudio: true,
        audioPeaks: [0.1, 0.3],
        height: 720,
        mimeType: 'video/webm',
        size: 100,
        width: 1280,
      }
    )
  ).toEqual(
    expect.objectContaining({
      metadata: expect.objectContaining({ duration: 4 }),
      name: 'Demo clip',
      type: VideoProjectAssetType.VIDEO,
    })
  );
}

it('covers subtitle clip defaults and export settings from the public facade', () => {
  const clip = createSubtitleClip('track-subtitle', 1920, 1080, 3);
  const project = createEmptyVideoProject('Export defaults', 1920, 1080);

  expect(clip).toEqual(
    expect.objectContaining({
      duration: 5,
      startTime: 3,
      text: expect.any(String),
      trackId: 'track-subtitle',
      type: VideoProjectClipType.SUBTITLE,
    })
  );
  expect(getDefaultExportSettings(project)).toEqual({
    burnInSubtitles: false,
    downloadAfterExport: true,
    format: 'MP4',
    mp4VideoCodec: 'AVC' as const,
    fps: 30,
    height: 1080,
    quality: 'MEDIUM',
    resolution: 'SOURCE',
    scope: 'project',
    subtitleSidecarFormats: [],
    width: 1920,
  });
});

function verifySharedRecordingProjectOverrides() {
  const customCursorTrack = createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE);
  const customMotionRegion = createVideoProjectMotionRegion(createEmptyVideoProject('Camera'), 0.5);
  const customAsset = createVideoProjectAsset(
    'silent.webm',
    VideoProjectAssetType.RECORDING,
    {
      kind: 'project-asset',
      projectAssetId: 'project-asset-3',
      originRecordingId: 'rec-3',
    },
    {
      width: 1280,
      height: 720,
      duration: 6,
      mimeType: 'video/webm',
      size: 512,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  const project = createVideoProjectFromRecording({
    recordingId: 'rec-3',
    filename: 'silent.webm',
    width: 1280,
    height: 720,
    duration: 6,
    mimeType: 'video/webm',
    size: 512,
    hasAudio: false,
    sourceNormalizedActionEvents: [],
    cursorTrack: customCursorTrack,
    motionRegions: [customMotionRegion],
    asset: customAsset,
  });

  expect(project.clips).toHaveLength(1);
  expect(project.tracks.map((track) => track.kind)).toEqual([VideoTrackKind.PRIMARY]);
  expect(project.assets[0]).toEqual({
    ...customAsset,
    recordingPart: { recordingId: 'rec-3', role: 'primary' },
  });
  expect(customAsset.recordingPart).toBeUndefined();
  expect(project.cursorTrack).toEqual(customCursorTrack);
  expect(project.motionRegions).toEqual([customMotionRegion]);
  expect(project.tracks.every((track) => track.isRoot === true)).toBe(true);
}

function expectRecordingProjectShape(project: ReturnType<typeof createVideoProjectFromRecording>) {
  expect(project.tracks.map((track) => track.kind)).toEqual([
    VideoTrackKind.PRIMARY,
    VideoTrackKind.AUDIO,
  ]);
  expect(project.baseRecordingId).toBe('rec-1');
  expect(project.name).toBe('demo');
  expect(project.assets).toHaveLength(1);
  expect(project.assets[0]?.type).toBe(VideoProjectAssetType.RECORDING);
  expect(project.clips).toHaveLength(2);
  expect(project.clips.map((clip) => clip.type)).toEqual([
    VideoProjectClipType.VIDEO,
    VideoProjectClipType.AUDIO,
  ]);
  expect(project.source).toEqual({
    kind: VideoProjectSourceKind.RECORDING,
    recordingId: 'rec-1',
  });
  expect(project.sceneBackground).toEqual({
    kind: VideoSceneBackgroundKind.SOLID,
    color: DEFAULT_VIDEO_PROJECT_BACKGROUND,
  });
  expect(project.cursorTrack).toBeNull();
  expect(project.motionRegions).toEqual([]);
  expect(project.duration).toBe(12.5);
}

it('exposes ordinary video and audio tracks without an annotation track kind', () => {
  expect(Object.values(VideoTrackKind)).not.toContain('OVERLAY');
});

it.each(['occupied', 'camera', 'locked', 'hidden', 'below-content'] as const)(
  'places an overlay above content without taking a %s track',
  (unavailable) => {
    const project = createEmptyVideoProject('Overlay placement');
    const screen = project.tracks[0]!;
    const candidate = createVideoProjectTrack('Video 2', 0, VideoTrackKind.PRIMARY);
    project.tracks.push(candidate);
    const screenClip = createTextClip(screen.id, project.width, project.height, 0);
    screenClip.duration = 10;
    project.clips.push(screenClip);
    if (unavailable === 'occupied') {
      const clip = createTextClip(candidate.id, project.width, project.height, 1);
      clip.duration = 3;
      project.clips.push(clip);
    }
    if (unavailable === 'camera') candidate.role = VideoProjectTrackRole.CAMERA;
    if (unavailable === 'locked') candidate.locked = true;
    if (unavailable === 'hidden') candidate.visible = false;
    if (unavailable === 'below-content') candidate.order = screen.order + 1;
    const original = structuredClone(project);
    const resolved = resolveVideoOverlayTrack(project, 2, 2, candidate.id);
    expect(resolved.kind).toBe(VideoTrackKind.PRIMARY);
    expect(project.tracks.some(({ id }) => id === resolved.id)).toBe(false);
    expect(resolved.order).toBeLessThan(Math.min(...project.tracks.map(({ order }) => order)));
    expect(project).toEqual(original);
  }
);

it('reuses a free upper video layer at the exact end of its previous clip', () => {
  const project = createEmptyVideoProject('Adjacent overlays');
  const layer = createVideoProjectTrack('Video 2', 0, VideoTrackKind.PRIMARY);
  project.tracks.push(layer);
  const clip = createTextClip(layer.id, project.width, project.height, 0);
  clip.duration = 2;
  project.clips.push(clip);
  expect(resolveVideoOverlayTrack(project, 2, 3, layer.id)).toBe(layer);
});
