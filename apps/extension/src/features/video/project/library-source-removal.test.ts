import { expect, it } from 'vitest';
import { createVideoProjectCursorTrack } from './defaults';
import { createEmptyVideoProject, createVideoProjectAsset } from './factories/creation';
import { createVideoClipFromAsset } from './factories/clip';
import { createShapeClip } from './factories/overlay-clip';
import { createVideoProjectMotionRegion } from './motion';
import { removeVideoProjectLibrarySources } from './library-source-removal';
import type { VideoProjectAssetSource } from './types';
import { VideoProjectAssetType, VideoTransitionEasing, VideoTransitionKind } from './types';
import { isExportReadyVideoProject } from './validation/root';

function fixture(source: VideoProjectAssetSource) {
  const project = createEmptyVideoProject('Montage');
  const metadata = {
    width: 100,
    height: 100,
    duration: 5,
    mimeType: 'video/webm',
    size: 100,
    hasAudio: false,
    audioPeaks: null,
  };
  const removed = createVideoProjectAsset('Removed', VideoProjectAssetType.VIDEO, source, metadata);
  const kept = createVideoProjectAsset(
    'Kept',
    VideoProjectAssetType.VIDEO,
    { kind: 'recording', recordingId: 'unrelated' },
    metadata
  );
  const removedClip = createVideoClipFromAsset(project.tracks[0]!.id, removed, 100, 100);
  const keptClip = createVideoClipFromAsset(project.tracks[0]!.id, kept, 100, 100);
  keptClip.startTime = 8;
  project.assets = [removed, kept];
  project.clips = [removedClip, keptClip];
  return { project, removed, kept, removedClip, keptClip };
}

it.each<VideoProjectAssetSource>([
  { kind: 'recording', recordingId: 'source' },
  { kind: 'project-asset', projectAssetId: 'source' },
  { kind: 'scenario-asset', scenarioAssetId: 'source' },
  { kind: 'library-asset', mediaId: 'source' },
])('removes all uses of $kind while preserving unrelated timing and input', (source) => {
  const { project, removed, kept, removedClip, keptClip } = fixture(source);
  project.assets.push({ ...removed, id: 'material-duplicate' });
  project.clips.push({ ...removedClip, id: 'clip-duplicate', assetId: 'material-duplicate' });
  const original = structuredClone(project);
  const result = removeVideoProjectLibrarySources(project, [source]);
  expect(result.assets).toEqual([kept]);
  expect(result.clips).toEqual([keptClip]);
  expect(result.tracks).toEqual(project.tracks);
  expect(result.duration).toBe(project.duration);
  expect(project).toEqual(original);
  expect(isExportReadyVideoProject(result)).toBe(true);
  expect(removeVideoProjectLibrarySources(result, [source])).toBe(result);
});

it('removes embedded references, background, transitions and object-track source references', () => {
  const source = { kind: 'project-asset' as const, projectAssetId: 'source' };
  const { project, removed, removedClip, keptClip } = fixture(source);
  const shape = createShapeClip(project.tracks[0]!.id, 100, 100, 0, 'RECTANGLE');
  shape.embeddedAsset = { assetId: removed.id, placement: { x: 0, y: 0, width: 10, height: 10 } };
  project.clips.push(shape);
  project.sceneBackground = { kind: 'image', assetId: removed.id };
  project.transitions = [
    {
      id: 'transition',
      leadingClipId: removedClip.id,
      trailingClipId: keptClip.id,
      duration: 1,
      kind: VideoTransitionKind.CROSSFADE,
      easing: VideoTransitionEasing.LINEAR,
    },
  ];
  const sample = { time: 1, x: 1, y: 1, visible: true, confidence: 1 };
  project.objectTracks = [
    {
      id: 'removed',
      kind: 'object',
      source: 'visualDetection',
      samples: [sample],
      analysis: {
        sourceAssetId: removed.id,
        sourceClipId: removedClip.id,
        projectStartTime: 0,
        projectEndTime: 5,
        sampleFps: 1,
      },
    },
    {
      id: 'mixed',
      kind: 'object',
      source: 'manual',
      samples: [
        { ...sample, sourceClipId: removedClip.id },
        { ...sample, sourceClipId: keptClip.id },
      ],
      correctionAnchors: [
        { id: 'gone', time: 1, x: 1, y: 1, sourceClipId: removedClip.id },
        { id: 'keep', time: 1, x: 1, y: 1 },
      ],
    },
  ];
  const result = removeVideoProjectLibrarySources(project, [source]);
  expect(result.sceneBackground).toEqual({ kind: 'solid', color: project.backgroundColor });
  expect(result.clips.find(({ id }) => id === shape.id)).toEqual(
    expect.not.objectContaining({ embeddedAsset: expect.anything() })
  );
  expect(result.transitions).toEqual([]);
  expect(result.objectTracks).toEqual([
    {
      ...project.objectTracks[1],
      samples: [{ ...sample, sourceClipId: keptClip.id }],
      correctionAnchors: [{ id: 'keep', time: 1, x: 1, y: 1 }],
    },
  ]);
  expect(isExportReadyVideoProject(result)).toBe(true);
});

it('clears motion references to removed clips and connections to removed regions', () => {
  const source = { kind: 'recording' as const, recordingId: 'source' };
  const { project, removedClip } = fixture(source);
  const region = createVideoProjectMotionRegion(project, 0);
  region.sourceBinding = {
    clipId: removedClip.id,
    sourceStart: 0,
    sourceEnd: 1,
    animation: { start: 0, end: 1, duration: 1 },
  };
  const retained = {
    ...createVideoProjectMotionRegion(project, 2),
    incomingConnection: { fromRegionId: region.id, easing: region.easing },
  };
  project.motionRegions = [region, retained];
  const result = removeVideoProjectLibrarySources(project, [source]);
  expect(result.motionRegions).toEqual([{ ...retained, incomingConnection: null }]);
  expect(isExportReadyVideoProject(result)).toBe(true);
});

it('does not mistake copied provenance for the deleted backing source', () => {
  const { project } = fixture({
    kind: 'project-asset',
    projectAssetId: 'copy',
    originRecordingId: 'source',
    originMediaId: 'recording:source',
  });
  expect(
    removeVideoProjectLibrarySources(project, [{ kind: 'recording', recordingId: 'source' }])
  ).toBe(project);
});

it('rejects an invalid changed project rather than returning an invalid deletion candidate', () => {
  const source = { kind: 'recording' as const, recordingId: 'source' };
  const { project } = fixture(source);
  project.clips[1]!.trackId = 'missing';
  expect(() => removeVideoProjectLibrarySources(project, [source])).toThrow(
    'Invalid video project payload'
  );
});

it('removes source interaction anchors while preserving authored project actions and cursor points', () => {
  const source = { kind: 'recording' as const, recordingId: 'source' };
  const { project, removedClip } = fixture(source);
  if (removedClip.type !== 'VIDEO') throw new Error('Expected a video fixture');
  removedClip.sourceInstanceId = 'source-instance';
  const authored = {
    id: 'authored',
    kind: 'CLICK' as const,
    anchor: { kind: 'project' as const, time: 9 },
    label: 'Authored',
    point: null,
    data: {},
  };
  project.actionEvents = [
    authored,
    {
      ...authored,
      id: 'captured',
      anchor: {
        kind: 'recording-source',
        recordingId: 'source',
        sourceInstanceId: 'source-instance',
        sourceEventId: 'captured',
        sourceTime: 1,
      },
    },
  ];
  const point = { id: 'point', time: 1, x: 0.5, y: 0.5, visible: true };
  project.cursorTrack = {
    ...createVideoProjectCursorTrack(),
    samples: [
      point,
      {
        ...point,
        id: 'anchored',
        sourceAnchor: {
          kind: 'recording-source',
          recordingId: 'source',
          sourceClipId: removedClip.id,
          sourceTime: 1,
        },
      },
    ],
  };
  const result = removeVideoProjectLibrarySources(project, [source]);
  expect(result.actionEvents).toEqual([authored]);
  expect(result.cursorTrack?.samples).toEqual([point]);
  expect(isExportReadyVideoProject(result)).toBe(true);
});
