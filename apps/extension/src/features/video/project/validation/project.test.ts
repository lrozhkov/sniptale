import { DEFAULT_WINDOW_HEADER } from '../../../browser-frame/header';
import { expect, it } from 'vitest';
import {
  createAnnotationClip,
  createShapeClip,
  createSubtitleClip,
  createTextClip,
} from '../factories/overlay-clip';
import { createAudioClipFromAsset, createVideoClipFromAsset } from '../factories/clip';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
  createVideoProjectAsset,
} from '../factories/creation';
import { createVideoProjectCursorTrack } from '../defaults';
import { createVideoProjectMotionRegion } from '../motion/index';
import {
  VideoTrackKind,
  VideoProjectTrackRole,
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
    capturedDuration: 0.2,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 100, y: 120 },
    presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
    anchor: { kind: 'project', time: 1 },
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
        targetAction: { eventId: actionEvent.id, clipId: null },
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

it('validates captured fact provenance while retaining out-of-range known source history', () => {
  const project = createProject();
  const recordingId = 'recording-1';
  const anchor = {
    kind: 'recording-source' as const,
    recordingId,
    sourceInstanceId: 'instance',
    sourceEventId: 'raw',
    sourceTime: 1,
  };
  const recordingProject = {
    ...project,
    assets: [{ ...project.assets[0]!, source: { kind: 'recording' as const, recordingId } }],
    clips: project.clips.map((clip) =>
      clip.type === 'VIDEO' ? { ...clip, sourceInstanceId: 'instance' } : clip
    ),
    actionEvents: [{ ...project.actionEvents[0]!, point: { x: 0.4, y: 0.5 }, anchor }],
    motionRegions: [],
  };
  expect(isExportReadyVideoProject(recordingProject)).toBe(true);
  expect(
    isExportReadyVideoProject({
      ...recordingProject,
      actionEvents: [
        { ...recordingProject.actionEvents[0]!, anchor: { ...anchor, sourceTime: 10 } },
      ],
    })
  ).toBe(true);
  for (const invalidAnchor of [
    { ...anchor, recordingId: 'foreign' },
    { ...anchor, sourceInstanceId: 'missing' },
  ]) {
    const invalidProject = {
      ...recordingProject,
      actionEvents: [{ ...recordingProject.actionEvents[0]!, anchor: invalidAnchor }],
    };
    expect(isHydratableVideoProject(invalidProject)).toBe(true);
    expect(isExportReadyVideoProject(invalidProject)).toBe(false);
  }
  expect(
    isExportReadyVideoProject({
      ...recordingProject,
      actionEvents: [
        recordingProject.actionEvents[0]!,
        { ...recordingProject.actionEvents[0]!, id: 'duplicate-fact' },
      ],
    })
  ).toBe(false);
});

it('rejects pre-public v1 projects at the hydration boundary', () => {
  const project = createProject();

  expect(isHydratableVideoProject({ ...project, version: 1 })).toBe(false);
  expect(parseHydratableVideoProject({ ...project, version: 1 })).toBeNull();
});

it('accepts all supported asset sources and clip variants', () => {
  const project = createEmptyVideoProject('Variants', 1280, 720);
  project.tracks.push(createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO));
  project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY));
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
      actionEvents: [{ ...project.actionEvents[0]!, anchor: { kind: 'source', time: 1 } }],
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
      actionEvents: [
        {
          ...project.actionEvents[0]!,
          anchor: {
            kind: 'recording-source',
            recordingId: 'recording-1',
            sourceInstanceId: 'instance',
            sourceEventId: 'raw',
            sourceTime: Number.POSITIVE_INFINITY,
          },
        },
      ],
    })
  ).toBe(false);
  expect(
    isHydratableVideoProject({
      ...project,
      cursorTrack: {
        ...project.cursorTrack!,
        samples: [
          {
            ...project.cursorTrack!.samples[0]!,
            sourceAnchor: {
              kind: 'project-time',
              recordingId: 'recording-1',
              sourceClipId: project.clips[0]!.id,
              sourceTime: 1,
            },
          },
        ],
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
  project.tracks.push(createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO));
  project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY));
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
    motionRegions: [
      { ...project.motionRegions![0]!, targetAction: { eventId: 'missing-action', clipId: null } },
    ],
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

it('accepts canonical gradient presets and rejects malformed or superseded gradient payloads', async () => {
  const { getShowcaseGradient } = await import('../../../highlighter/showcase-resources');
  const project = createEmptyVideoProject('Paint');
  for (const id of ['system-ocean', 'system-radial-glow', 'system-conic-spectrum'] as const) {
    project.sceneBackground = { kind: 'gradient', gradient: getShowcaseGradient(id) };
    expect(parseHydratableVideoProject(project)?.sceneBackground).toEqual(project.sceneBackground);
  }
  expect(
    isHydratableVideoProject({
      ...project,
      sceneBackground: {
        kind: 'gradient',
        from: '#000',
        to: '#fff',
        angle: 90,
      },
    })
  ).toBe(false);
  const gradient = getShowcaseGradient('system-ocean');
  for (const invalid of [
    null,
    {},
    { ...gradient, stops: [] },
    {
      ...gradient,
      stops: [gradient.stops[0], gradient.stops[0]],
    },
    {
      ...gradient,
      stops: gradient.stops.map((stop) => ({ ...stop, color: 'url(https://example.com)' })),
    },
  ]) {
    expect(
      isHydratableVideoProject({
        ...project,
        sceneBackground: { kind: 'gradient', gradient: invalid },
      })
    ).toBe(false);
  }
});

it('rejects removed annotation track kinds at project admission', () => {
  const project = createEmptyVideoProject('Removed track');
  const payload = { ...project, tracks: [{ ...project.tracks[0], kind: 'OVERLAY' }] };
  expect(isHydratableVideoProject(payload)).toBe(false);
  expect(isExportReadyVideoProject(payload)).toBe(false);
});

it('accepts detailed audio envelopes but rejects oversized or invalid peak payloads', () => {
  const project = createEmptyVideoProject();
  const asset = createVideoProjectAsset(
    'Audio',
    VideoProjectAssetType.AUDIO,
    { kind: 'project-asset', projectAssetId: 'audio' },
    {
      width: 0,
      height: 0,
      duration: 300,
      mimeType: 'audio/mpeg',
      size: 100,
      hasAudio: true,
      audioPeaks: new Array(30_000).fill(0.25),
    }
  );
  project.assets = [asset];
  expect(isHydratableVideoProject(project)).toBe(true);
  asset.metadata.audioPeaks!.push(0.25);
  expect(isHydratableVideoProject(project)).toBe(false);
  asset.metadata.audioPeaks = [NaN];
  expect(isHydratableVideoProject(project)).toBe(false);
});

for (const type of [VideoProjectAssetType.VIDEO, VideoProjectAssetType.IMAGE]) {
  it(`retains ${type} window appearances and embedded favicon through project admission`, () => {
    const project = createEmptyVideoProject('Window admission');
    const asset = createAssetWithSource(type, { kind: 'project-asset', projectAssetId: 'media' });
    const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720);
    project.assets = [asset];
    project.clips = [clip];
    const undecorated: unknown = JSON.parse(JSON.stringify(project));
    expect(parseHydratableVideoProject(undecorated)).toEqual(project);
    expect(parseHydratableVideoProject(undecorated)?.clips[0]).not.toHaveProperty('windowHeader');
    const faviconDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';
    for (const kind of ['browser', 'application'] as const) {
      for (const style of ['windows', 'macos', 'linux'] as const) {
        for (const theme of ['light', 'dark'] as const) {
          const windowHeader = {
            ...DEFAULT_WINDOW_HEADER,
            kind,
            style,
            theme,
            title: 'Saved & <authored> title',
            url: 'https://example.test/path?a=1&b=2',
            faviconEnabled: true,
            faviconDataUrl,
          };
          const saved = { ...project, clips: [{ ...clip, windowHeader }] };
          const restored: unknown = JSON.parse(JSON.stringify(saved));
          expect(parseHydratableVideoProject(restored)).toEqual(saved);
          expect(isExportReadyVideoProject(restored)).toBe(true);
        }
      }
    }
  });

  it(`rejects malformed present ${type} window headers without silently dropping them`, () => {
    const project = createEmptyVideoProject('Invalid header');
    const asset = createAssetWithSource(type, { kind: 'project-asset', projectAssetId: 'media' });
    const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720);
    project.assets = [asset];
    for (const windowHeader of [
      null,
      {},
      { ...DEFAULT_WINDOW_HEADER, theme: 'system' },
      { ...DEFAULT_WINDOW_HEADER, style: 'unknown' },
      { ...DEFAULT_WINDOW_HEADER, faviconEnabled: 'true' },
      { ...DEFAULT_WINDOW_HEADER, title: 'x'.repeat(513) },
      {
        ...DEFAULT_WINDOW_HEADER,
        faviconEnabled: true,
        faviconDataUrl: 'https://example.test/icon.png',
      },
    ]) {
      const saved = { ...project, clips: [{ ...clip, windowHeader }] };
      expect(isHydratableVideoProject(saved)).toBe(false);
      expect(parseHydratableVideoProject(saved)).toBeNull();
      expect(saved.clips[0]?.windowHeader).toBe(windowHeader);
    }
  });
}

it('retains decorated source media alongside an independently animated camera on project restore', () => {
  const project = createProject();
  const original = project.clips[0]!;
  if (original.type !== 'VIDEO') throw new Error('Expected source video fixture');
  const windowHeader = { ...DEFAULT_WINDOW_HEADER, title: 'Recorded browser' };
  const cameraTrack = {
    ...createVideoProjectTrack('Camera', 1, VideoTrackKind.PRIMARY),
    role: VideoProjectTrackRole.CAMERA,
  };
  const cameraAsset = createAssetWithSource(VideoProjectAssetType.VIDEO, {
    kind: 'project-asset',
    projectAssetId: 'camera-recording',
  });
  const camera = createVideoClipFromAsset(
    cameraTrack.id,
    cameraAsset,
    project.width,
    project.height
  );
  if (camera.type !== 'VIDEO') throw new Error('Expected camera video fixture');
  camera.cameraPositions = [
    {
      id: 'camera-corner',
      sourceTime: 2,
      fitMode: camera.fitMode,
      transform: { x: 900, y: 500, width: 320, height: 180, rotation: 0, opacity: 1 },
      transition: { kind: 'smooth', duration: 0.5 },
    },
  ];
  project.tracks.push(cameraTrack);
  project.assets.push(cameraAsset);
  project.clips = [{ ...original, windowHeader }, camera];
  const serialized: unknown = JSON.parse(JSON.stringify(project));
  const restored = parseHydratableVideoProject(serialized);
  expect(restored).toEqual(project);
  expect(isExportReadyVideoProject(restored)).toBe(true);
  expect(restored?.clips[0]).toHaveProperty('windowHeader', windowHeader);
  expect(restored?.clips[1]).toHaveProperty('cameraPositions', camera.cameraPositions);
  expect(restored?.clips[1]).not.toHaveProperty('windowHeader');
});
