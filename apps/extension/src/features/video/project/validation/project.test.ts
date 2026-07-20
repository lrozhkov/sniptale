import { expect, it } from 'vitest';
import {
  createAnnotationClip,
  createShapeClip,
  createSubtitleClip,
  createTextClip,
} from '../factories/overlay-clip';
import { createAudioClipFromAsset, createVideoClipFromAsset } from '../factories/clip';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createVideoProjectCursorTrack } from '../defaults';
import { createVideoProjectMotionRegion } from '../motion/index';
import {
  type VideoProject,
  type VideoProjectActionEvent,
  type VideoProjectAsset,
  type VideoProjectClip,
  type VideoProjectCursorTrack,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectAssetType,
  VideoProjectShapeType,
  VideoSceneBackgroundKind,
  VideoTemporalEasing,
} from '../types/index';
import {
  isExportReadyVideoProject,
  isHydratableVideoProject,
  parseHydratableVideoProject,
} from './root';

function createAsset(): VideoProjectAsset {
  return createAssetWithSource(VideoProjectAssetType.VIDEO, {
    kind: 'project-asset',
    projectAssetId: 'project-asset-1',
  });
}

function createAssetWithSource(
  type: VideoProjectAssetType,
  source: VideoProjectAsset['source']
): VideoProjectAsset {
  return createVideoProjectAsset(`Asset ${type}`, type, source, {
    audioPeaks: null,
    duration: 5,
    hasAudio: true,
    height: 720,
    mimeType: 'video/webm',
    size: 1024,
    width: 1280,
  });
}

function createActionEvent(): VideoProjectActionEvent {
  return {
    data: { button: 'primary' },
    duration: 0.2,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 100, y: 120 },
    preset: VideoProjectActionPreset.CLICK_RIPPLE,
    time: 1,
  };
}

function createCursorTrack(): VideoProjectCursorTrack {
  return {
    ...createVideoProjectCursorTrack(),
    samples: [
      {
        id: 'sample-1',
        interpolation: VideoTemporalEasing.LINEAR,
        time: 0.5,
        visible: true,
        x: 100,
        y: 120,
      },
    ],
  };
}

function createVariantAssets(): VideoProjectAsset[] {
  return [
    createAssetWithSource(VideoProjectAssetType.VIDEO, {
      kind: 'recording',
      recordingId: 'recording-1',
    }),
    createAssetWithSource(VideoProjectAssetType.AUDIO, {
      kind: 'project-asset',
      originRecordingId: 'recording-1',
      projectAssetId: 'project-asset-2',
    }),
    createAssetWithSource(VideoProjectAssetType.IMAGE, {
      kind: 'scenario-asset',
      scenarioAssetId: 'scenario-asset-1',
    }),
  ];
}

function createVariantClips(
  project: VideoProject,
  assets: VideoProjectAsset[]
): VideoProjectClip[] {
  return [
    createVideoClipFromAsset(project.tracks[0]!.id, assets[0]!, 1280, 720),
    createAudioClipFromAsset(project.tracks[1]!.id, assets[1]!),
    createVideoClipFromAsset(project.tracks[2]!.id, assets[2]!, 1280, 720),
    createTextClip(project.tracks[2]!.id, 1280, 720, 1),
    createSubtitleClip(project.tracks[2]!.id, 1280, 720, 2),
    createShapeClip(project.tracks[2]!.id, 1280, 720, 3, VideoProjectShapeType.RECTANGLE),
    createAnnotationClip(project.tracks[2]!.id, 1280, 720, 4),
  ];
}

function createProject(): VideoProject {
  const project = createEmptyVideoProject('Validated', 1280, 720);
  const asset = createAsset();
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720);
  const actionEvent = createActionEvent();

  return {
    ...project,
    actionEvents: [actionEvent],
    assets: [asset],
    clips: [clip],
    cursorTrack: createCursorTrack(),
    duration: clip.duration,
    motionRegions: [
      {
        ...createVideoProjectMotionRegion(project, 1),
        targetActionEventId: actionEvent.id,
      },
    ],
  };
}

it('accepts real project factory output at hydration and export boundaries', () => {
  const project = createProject();

  expect(isHydratableVideoProject(project)).toBe(true);
  expect(parseHydratableVideoProject(project)).toBe(project);
  expect(isExportReadyVideoProject(project)).toBe(true);
});

it('rejects pre-public v1 projects at the hydration boundary', () => {
  const project = createProject();

  expect(isHydratableVideoProject({ ...project, version: 1 })).toBe(false);
  expect(parseHydratableVideoProject({ ...project, version: 1 })).toBeNull();
});

it('accepts all supported asset sources and clip variants', () => {
  const project = createEmptyVideoProject('Variants', 1280, 720);
  const assets = createVariantAssets();
  const clips = createVariantClips(project, assets);

  expect(
    isExportReadyVideoProject({
      ...project,
      assets,
      clips,
      duration: 10,
    })
  ).toBe(true);
});

it('rejects malformed nested clip, asset, track, cursor, and motion fields', () => {
  const project = createProject();

  expect(
    isHydratableVideoProject({
      ...project,
      clips: [{ ...project.clips[0]!, sourceDuration: Number.POSITIVE_INFINITY }],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      assets: [
        {
          ...project.assets[0]!,
          metadata: { ...project.assets[0]!.metadata, audioPeaks: [0.1, Number.NaN] },
        },
      ],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      assets: [{ ...project.assets[0]!, source: { kind: 'remote' } }],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      tracks: [{ ...project.tracks[0]!, locked: 'false' }],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      cursorTrack: {
        ...project.cursorTrack!,
        samples: [{ ...project.cursorTrack!.samples[0]!, time: Number.POSITIVE_INFINITY }],
      },
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      motionRegions: [{ ...project.motionRegions![0]!, scale: Number.NaN }],
    })
  ).toBe(false);
});

it('rejects invalid top-level enums and numeric bounds', () => {
  const project = createProject();

  expect(isHydratableVideoProject({ ...project, duration: -1 })).toBe(false);
  expect(isHydratableVideoProject({ ...project, fps: 0 })).toBe(false);
  expect(isHydratableVideoProject({ ...project, width: Number.POSITIVE_INFINITY })).toBe(false);
  expect(isHydratableVideoProject({ ...project, timelinePlacementMode: 'SPLICE' })).toBe(false);
  expect(isHydratableVideoProject({ ...project, source: { kind: 'recording' } })).toBe(false);
});

it('rejects malformed annotation clip fields', () => {
  const project = createEmptyVideoProject('Annotation', 1280, 720);
  const annotationClip = createAnnotationClip(project.tracks[2]!.id, 1280, 720, 0);

  expect(isHydratableVideoProject({ ...project, clips: [annotationClip] })).toBe(true);
  expect(
    isHydratableVideoProject({
      ...project,
      clips: [
        {
          ...annotationClip,
          leaderLine: { ...annotationClip.leaderLine, thickness: -1 },
        },
      ],
    })
  ).toBe(false);
});

it('rejects oversized project arrays before walking entries', () => {
  const project = createProject();
  const oversizedTracks = Array.from({ length: 5001 }, (_, index) => ({
    ...project.tracks[0]!,
    id: `track-${index}`,
  }));

  expect(isHydratableVideoProject({ ...project, tracks: oversizedTracks })).toBe(false);
});

it('allows persisted hydration with missing references but rejects export-ready payloads', () => {
  const project = createProject();
  const missingBackgroundReference = {
    ...project,
    sceneBackground: { assetId: 'missing-background', kind: VideoSceneBackgroundKind.IMAGE },
  };
  const missingTrackReference = {
    ...project,
    clips: [{ ...project.clips[0]!, trackId: 'missing-track' }],
  };
  const missingAssetReference = {
    ...project,
    clips: [{ ...project.clips[0]!, assetId: 'missing-asset' }],
  };
  const missingActionReference = {
    ...project,
    motionRegions: [{ ...project.motionRegions![0]!, targetActionEventId: 'missing-action' }],
  };

  expect(isHydratableVideoProject(missingTrackReference)).toBe(true);
  expect(isHydratableVideoProject(missingBackgroundReference)).toBe(true);
  expect(isExportReadyVideoProject(missingBackgroundReference)).toBe(false);
  expect(isExportReadyVideoProject(missingTrackReference)).toBe(false);
  expect(isHydratableVideoProject(missingAssetReference)).toBe(true);
  expect(isExportReadyVideoProject(missingAssetReference)).toBe(false);
  expect(isHydratableVideoProject(missingActionReference)).toBe(true);
  expect(isExportReadyVideoProject(missingActionReference)).toBe(false);
});
