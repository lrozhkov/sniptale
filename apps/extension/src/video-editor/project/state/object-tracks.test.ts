import { expect, it } from 'vitest';
import type { VideoObjectTrack } from '../../../features/video/project/object-tracks';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

function createStoreState() {
  return createVideoEditorProjectTestStore();
}

it('upserts normalized visual cursor object tracks into the current project', () => {
  const store = createStoreState();
  store.getState().setProject(createEmptyVideoProject('Object tracks'));

  store.getState().upsertObjectTrack(createUnsortedVisualCursorTrack());
  store.getState().upsertObjectTrack({ ...createUnsortedVisualCursorTrack(), id: 'other-track' });
  store.getState().upsertObjectTrack({
    ...createUnsortedVisualCursorTrack(),
    samples: [{ confidence: 0.4, time: 2, visible: true, x: 30, y: 40 }],
  });

  expect(store.getState().project?.objectTracks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'visual-cursor',
        kind: 'visualCursor',
        samples: [expect.objectContaining({ confidence: 0.4, time: 2, x: 30 })],
        source: 'visualDetection',
      }),
      expect.objectContaining({ id: 'other-track' }),
    ])
  );
});

it('initializes missing object-track arrays from analysis output', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Missing object tracks');
  delete project.objectTracks;
  store.getState().setProject(project);

  store.getState().upsertObjectTrack(createUnsortedVisualCursorTrack());

  expect(store.getState().project?.objectTracks).toEqual([
    expect.objectContaining({ id: 'visual-cursor' }),
  ]);
});

it('normalizes object track ids away from the cursor-track follow sentinel', () => {
  const store = createStoreState();
  store.getState().setProject(createEmptyVideoProject('Reserved object track id'));

  store.getState().upsertObjectTrack({ ...createUnsortedVisualCursorTrack(), id: 'cursorTrack' });

  expect(store.getState().project?.objectTracks).toEqual([
    expect.objectContaining({ id: 'object-cursorTrack' }),
  ]);
});

it('adds correction anchors and immediate visible samples to object tracks', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Correction anchors');
  project.objectTracks = [createUnsortedVisualCursorTrack()];
  store.getState().setProject(project);

  store.getState().upsertObjectTrackCorrectionAnchor('visual-cursor', {
    confidence: 0.8,
    time: 0.5,
    x: 15,
    y: 25,
  });

  expect(store.getState().project?.objectTracks?.[0]).toEqual(
    expect.objectContaining({
      correctionAnchors: [expect.objectContaining({ confidence: 0.8, time: 0.5, x: 15 })],
      samples: [
        expect.objectContaining({ time: 0, x: 5 }),
        expect.objectContaining({ confidence: 0.8, time: 0.5, visible: true, x: 15 }),
        expect.objectContaining({ time: 1, x: 10 }),
      ],
    })
  );
});

it('updates existing correction anchors and ignores missing correction targets', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Correction anchor updates');
  project.objectTracks = [
    {
      ...createUnsortedVisualCursorTrack(),
      correctionAnchors: [{ confidence: 0.5, id: 'anchor-1', time: 1, x: 10, y: 20 }],
    },
  ];
  store.getState().setProject(project);

  store.getState().upsertObjectTrackCorrectionAnchor('missing-track', {
    time: 1,
    x: 1,
    y: 2,
  });
  store.getState().upsertObjectTrackCorrectionAnchor('visual-cursor', {
    confidence: 0.7,
    height: 24,
    id: 'anchor-1',
    time: 1,
    width: 32,
    x: 30,
    y: 40,
  });

  expect(store.getState().project?.objectTracks?.[0]).toEqual(
    expect.objectContaining({
      correctionAnchors: [
        expect.objectContaining({ confidence: 0.7, id: 'anchor-1', time: 1, x: 30 }),
      ],
      samples: expect.arrayContaining([
        expect.objectContaining({ height: 24, time: 1, width: 32, x: 30, y: 40 }),
      ]),
    })
  );
});

it('starts object-track anchor placement only for existing tracks', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Anchor placement');
  project.objectTracks = [createUnsortedVisualCursorTrack()];
  store.getState().startObjectTrackAnchorPlacement('visual-cursor');
  expect(store.getState().placementMode).toBeNull();

  store.getState().setProject(project);

  store.getState().startObjectTrackAnchorPlacement('missing');
  expect(store.getState().placementMode).toBeNull();

  store.getState().startObjectTrackAnchorPlacement('visual-cursor');
  expect(store.getState().placementMode).toEqual({
    kind: 'object-track-anchor',
    objectTrackId: 'visual-cursor',
  });
});

it('deletes object tracks without mutating EffectV1 instances', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Delete object track');
  project.objectTracks = [createUnsortedVisualCursorTrack()];
  project.effectInstances = [];
  store.getState().setProject(project);

  store.getState().deleteObjectTrack('visual-cursor');

  expect(store.getState().project?.objectTracks).toEqual([]);
  expect(store.getState().project?.effectInstances).toEqual([]);
});

it('deletes from projects without existing object-track arrays', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Empty object tracks');
  delete project.objectTracks;
  store.getState().setProject(project);

  store.getState().deleteObjectTrack('visual-cursor');

  expect(store.getState().project?.objectTracks).toEqual([]);
});

it('ignores object-track mutations when no project is loaded', () => {
  const store = createStoreState();

  store.getState().upsertObjectTrack(createUnsortedVisualCursorTrack());
  store.getState().deleteObjectTrack('visual-cursor');

  expect(store.getState().project).toBeNull();
});

function createUnsortedVisualCursorTrack(): VideoObjectTrack {
  return {
    id: 'visual-cursor',
    kind: 'visualCursor',
    samples: [
      { confidence: 1.4, time: 1, visible: true, x: 10, y: 20 },
      { confidence: -0.5, time: 0, visible: true, x: 5, y: 8 },
    ],
    source: 'visualDetection',
  };
}

it('keeps corrections on the trailing source instance after insertion and deleting its head', () => {
  const store = createStoreState();
  const project = createEmptyVideoProject('Tracked montage');
  const asset = createVideoProjectAsset(
    'Recording',
    'VIDEO',
    { kind: 'recording', recordingId: 'recording' },
    {
      width: 1280,
      height: 720,
      duration: 4,
      mimeType: 'video/webm',
      size: 100,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  store.getState().setProject(project);
  store.getState().appendMaterial(asset.id);
  const headId = store.getState().project!.clips[0]!.id;
  store.getState().upsertObjectTrack({
    ...createUnsortedVisualCursorTrack(),
    analysis: {
      sourceAssetId: asset.id,
      sourceClipId: headId,
      projectStartTime: 0,
      projectEndTime: 4,
      sampleFps: 2,
    },
    samples: [
      { time: 0.5, x: 1, y: 1, visible: true, confidence: 1 },
      { time: 3, x: 2, y: 2, visible: true, confidence: 1 },
    ],
  });
  store.getState().setCurrentTime(2);
  store.getState().insertMaterial(asset.id);
  const tailId = store.getState().project!.objectTracks![0]!.samples[1]!.sourceClipId;
  expect(tailId).toBeTypeOf('string');
  store.getState().upsertObjectTrackCorrectionAnchor('visual-cursor', { time: 7, x: 30, y: 40 });
  const corrected = store.getState().project!.objectTracks![0]!;
  expect(corrected.correctionAnchors![0]).toMatchObject({ time: 7, sourceClipId: tailId });
  expect(corrected.samples[1]).toMatchObject({ time: 7, sourceClipId: tailId, x: 30 });
  store.getState().deleteClip(headId);
  expect(store.getState().project!.objectTracks![0]!.correctionAnchors).toMatchObject([
    { time: 7, sourceClipId: tailId },
  ]);
});
