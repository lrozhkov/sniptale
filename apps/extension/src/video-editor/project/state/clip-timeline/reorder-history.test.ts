import { materializeVideoProjectCursorSourceObservations } from '../../../../features/video/project/cursor-source-observations';
import { resolveVideoProjectActionOccurrences } from '../../../../features/video/project/action-occurrences';
import { expect, it } from 'vitest';
import { setup } from '../insertion/material.test-support';
import { hydrateVideoProject } from '../../../../features/video/project/hydration';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { undoVideoEditorProjectHistory, redoVideoEditorProjectHistory } from '../../history';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { VideoCursorCaptureMode } from '../../../../features/video/project/types';

it('commits a swap once, retains selection/playhead and reconciles source anchors through undo/reload', () => {
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'rec' };
  store.getState().appendMaterial(asset.id, { start: 0, end: 4 });
  store.getState().appendMaterial(asset.id, { start: 4, end: 6 });
  const base = store.getState().project!;
  const first = base.clips[0]!;
  if (first.type !== 'VIDEO' || !first.sourceInstanceId)
    throw new Error('Expected source instance');
  const cursorAnchor = {
    kind: 'recording-source' as const,
    recordingId: 'rec',
    sourceClipId: first.id,
    sourceTime: 1,
  };
  const event = {
    id: 'anchored',
    kind: 'CLICK' as const,
    capturedDuration: 0.5,
    point: { x: 0.5, y: 0.5 },
    label: '',
    data: {},
    anchor: {
      kind: 'recording-source' as const,
      recordingId: 'rec',
      sourceInstanceId: first.sourceInstanceId,
      sourceEventId: 'raw',
      sourceTime: 1,
    },
  };
  const region = {
    ...createVideoProjectMotionRegion(base, 0.75),
    duration: 1,
    targetAction: { eventId: event.id, clipId: first.id },
    sourceBinding: {
      clipId: first.id,
      sourceStart: 0.75,
      sourceEnd: 1.75,
      animation: { start: 0, end: 1, duration: 1 },
    },
  };
  const manual = event;
  store.setState({
    selection: { kind: 'clip', clipId: first.id },
    selectedTrackId: first.trackId,
    currentTime: 1.5,
    project: {
      ...base,
      actionEvents: [event, { ...manual, id: 'manual', anchor: { kind: 'project', time: 0.25 } }],
      motionRegions: [region],
      cursorTrack: {
        captureMode: VideoCursorCaptureMode.SEPARATE,
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [
          { id: 'cursor', time: 1, x: 50, y: 50, visible: true, sourceAnchor: cursorAnchor },
        ],
      },
      objectTracks: [
        {
          id: 'object',
          kind: 'object',
          source: 'telemetry',
          analysis: {
            sourceAssetId: asset.id,
            sourceClipId: first.id,
            projectStartTime: 0,
            projectEndTime: 4,
            sampleFps: 1,
          },
          samples: [
            { sourceClipId: first.id, time: 1, x: 50, y: 50, visible: true, confidence: 1 },
          ],
        },
      ],
    },
  });
  const before = store.getState();
  for (const lane of ['actions', 'camera'] as const) {
    store.setState({
      project: {
        ...before.project!,
        utilityLanes: {
          actions: { visible: true, locked: lane === 'actions' },
          camera: { visible: true, locked: lane === 'camera' },
        },
      },
    });
    const locked = store.getState();
    store.getState().swapClip(first.id, 'right');
    expect(store.getState().project).toBe(locked.project);
    expect(store.getState().projectHistory).toBe(locked.projectHistory);
  }
  store.setState({ project: before.project });
  store.getState().swapClip(first.id, 'right');
  const after = store.getState();
  expect(after.projectHistory.past).toHaveLength(before.projectHistory.past.length + 1);
  expect(after.selection).toEqual(before.selection);
  expect(after.currentTime).toBe(1.5);
  expect(after.project!.clips.map((clip) => clip.startTime)).toEqual([2, 0]);
  expect(after.project!.actionEvents.find((item) => item.id === event.id)).toEqual(event);
  expect(
    resolveVideoProjectActionOccurrences(after.project!).find((item) => item.eventId === event.id)
      ?.time
  ).toBe(3);
  expect(after.project!.actionEvents.find((item) => item.id === 'manual')?.anchor).toEqual({
    kind: 'project',
    time: 0.25,
  });
  expect(after.project!.motionRegions?.[0]).toMatchObject({ startTime: 2.75, duration: 1 });
  expect(after.project!.cursorTrack?.samples[0]).toMatchObject({
    time: 3,
    sourceAnchor: cursorAnchor,
  });
  expect(after.project!.objectTracks?.[0]?.samples[0]).toMatchObject({
    time: 3,
    sourceClipId: first.id,
  });
  const reopened = hydrateVideoProject(after.project!);
  expect(reopened.clips).toMatchObject(after.project!.clips);
  const undo = undoVideoEditorProjectHistory(after.projectHistory, after.project!);
  expect(undo?.status).toBe('applied');
  if (undo?.status !== 'applied') throw new Error('Undo did not apply');
  expect(undo.project.clips).toEqual(before.project!.clips);
  expect(undo.project.actionEvents).toEqual(before.project!.actionEvents);
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  expect(redo?.status).toBe('applied');
  if (redo?.status === 'applied') expect(redo.project.clips).toEqual(after.project!.clips);
});

it('rejects locks and end-of-track commands without publishing a document or history change', () => {
  const { store, asset } = setup(true);
  store.getState().appendMaterial(asset.id, { start: 0, end: 4 });
  store.getState().appendMaterial(asset.id, { start: 4, end: 6 });
  const project = store.getState().project!;
  const first = project.clips[0]!;
  store.getState().swapClip(first.id, 'left');
  expect(store.getState().project).toBe(project);
  store.setState({
    project: {
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, locked: !track.isRoot })),
    },
  });
  const before = store.getState();
  store.getState().swapClip(first.id, 'right');
  expect(store.getState().project).toBe(before.project);
  expect(store.getState().projectHistory).toBe(before.projectHistory);
});

it('preserves cursor source facts and independent keys through split, duplicate, removal, Undo and reopen', () => {
  const { store, asset } = setup();
  asset.source = { kind: 'recording', recordingId: 'cursor-recording' };
  store.getState().appendMaterial(asset.id, { start: 0, end: 6 });
  const project = store.getState().project!;
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO' || !clip.sourceInstanceId) throw new Error('Expected source');
  const instance = clip.sourceInstanceId;
  const raw = [
    {
      id: 'raw-a',
      time: 0,
      x: 0,
      y: 0,
      visible: true,
      observation: 'observed' as const,
      recordingPoint: { x: 0, y: 0 },
      interpolation: 'LINEAR' as const,
    },
    {
      id: 'raw-b',
      time: 6,
      x: 1280,
      y: 720,
      visible: true,
      observation: 'observed' as const,
      recordingPoint: { x: 1, y: 1 },
      interpolation: 'LINEAR' as const,
    },
  ];
  store.setState({
    project: {
      ...project,
      version: 33,
      cursorTrack: {
        captureMode: VideoCursorCaptureMode.SEPARATE,
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [],
        sourceObservations: [
          { recordingId: 'cursor-recording', sourceInstanceId: instance, samples: raw },
        ],
      },
      cursorFocusPath: {
        version: 1,
        smoothing: 0.5,
        sensitivity: 1,
        mode: 'follow',
        gapPolicy: 'hold',
        segments: [
          {
            id: 'authoring',
            binding: {
              kind: 'recording-source',
              recordingId: 'cursor-recording',
              sourceInstanceId: instance,
            },
            start: 0,
            end: 6,
            keys: [
              {
                id: `focus-override:${instance}:raw-a`,
                time: 0,
                x: 0.2,
                y: 0.3,
                anchor: 'manual',
                authored: true,
                interpolation: 'smooth',
              },
              {
                id: `${instance}:raw-b`,
                time: 6,
                x: 1,
                y: 1,
                anchor: 'movement',
                authored: true,
                interpolation: 'smooth',
              },
              {
                id: `end:segment:${instance}:raw-b`,
                time: 6,
                x: 1,
                y: 1,
                anchor: 'boundary',
                authored: true,
                interpolation: 'smooth',
              },
            ],
          },
        ],
      },
    },
  });
  const capturedProject = store.getState().project!;
  store.setState({
    project: {
      ...capturedProject,
      cursorTrack: materializeVideoProjectCursorSourceObservations(capturedProject),
    },
  });
  const endSample = store
    .getState()
    .project!.cursorTrack!.samples.find((sample) => sample.sourceAnchor?.sourceTime === 6)!;
  store.getState().updateCursorSampleSkinOverride(endSample.id, { color: '#00ffaa' });
  const editedProject = store.getState().project!;
  store.setState({
    project: {
      ...editedProject,
      cursorTrack: {
        ...editedProject.cursorTrack!,
        samples: editedProject.cursorTrack!.samples.map((sample) =>
          sample.id === endSample.id ? { ...sample, interpolation: 'EASE_OUT' as const } : sample
        ),
      },
    },
  });
  store.getState().splitClipAt(clip.id, 3);
  const split = store.getState().project!;
  expect
    .soft(split.cursorTrack!.samples.find((sample) => sample.sourceAnchor?.sourceTime === 6))
    .toMatchObject({ skinOverride: { color: '#00ffaa' }, interpolation: 'EASE_OUT' });
  expect(split.cursorTrack?.sourceObservations).toEqual([
    { recordingId: 'cursor-recording', sourceInstanceId: instance, samples: raw },
  ]);
  expect(
    split.cursorTrack?.samples.filter((sample) => sample.sourceAnchor?.sourceTime === 3)
  ).toHaveLength(2);
  const firstSample = split.cursorTrack!.samples[0]!;
  store.getState().updateCursorSampleSkinOverride(firstSample.id, { color: '#ff00aa' });
  expect(
    store.getState().project!.cursorTrack!.samples.find((sample) => sample.id === firstSample.id)
      ?.skinOverride?.color
  ).toBe('#ff00aa');
  const headBoundary = store
    .getState()
    .project!.cursorTrack!.samples.find(
      (sample) =>
        sample.sourceAnchor?.sourceClipId === clip.id && sample.sourceAnchor.sourceTime === 3
    )!;
  const tailBoundary = store
    .getState()
    .project!.cursorTrack!.samples.find(
      (sample) =>
        sample.sourceAnchor?.sourceClipId !== clip.id && sample.sourceAnchor?.sourceTime === 3
    )!;
  store.getState().updateCursorSampleSkinOverride(headBoundary.id, { color: '#0000ff' });
  const boundaryProject = store.getState().project!;
  store.setState({
    project: {
      ...boundaryProject,
      cursorTrack: {
        ...boundaryProject.cursorTrack!,
        samples: boundaryProject.cursorTrack!.samples.map((sample) =>
          sample.id === headBoundary.id ? { ...sample, interpolation: 'INSTANT' as const } : sample
        ),
      },
    },
  });
  store.getState().updateCursorSampleSkinOverride(tailBoundary.id, { color: '#ffff00' });
  store.getState().duplicateClip(clip.id);
  const duplicated = store.getState().project!;
  const copy = duplicated.clips.find(
    (item) => item.type === 'VIDEO' && item.sourceInstanceId !== instance
  );
  if (copy?.type !== 'VIDEO' || !copy.sourceInstanceId) throw new Error('Expected duplicate');
  const copiedSamples = duplicated.cursorTrack!.samples.filter(
    (sample) => sample.sourceAnchor?.sourceClipId === copy.id
  );
  expect
    .soft(copiedSamples.find((sample) => sample.sourceAnchor?.sourceTime === 0))
    .toMatchObject({ skinOverride: { color: '#ff00aa' } });
  expect
    .soft(copiedSamples.find((sample) => sample.sourceAnchor?.sourceTime === 3))
    .toMatchObject({ skinOverride: { color: '#0000ff' }, interpolation: 'INSTANT' });
  expect(
    duplicated.cursorTrack!.samples.find((sample) => sample.id === tailBoundary.id)
  ).toMatchObject({ skinOverride: { color: '#ffff00' } });
  expect(duplicated.cursorTrack?.sourceObservations).toHaveLength(2);
  expect(duplicated.cursorTrack?.sourceObservations?.[1]).toEqual({
    recordingId: 'cursor-recording',
    sourceInstanceId: copy.sourceInstanceId,
    samples: raw,
  });
  expect(duplicated.cursorTrack!.sourceObservations![1]!.samples).not.toBe(
    duplicated.cursorTrack!.sourceObservations![0]!.samples
  );
  const copiedFirst = copiedSamples.find((sample) => sample.sourceAnchor?.sourceTime === 0)!;
  store.getState().updateCursorSampleSkinOverride(copiedFirst.id, { color: '#11aa00' });
  expect(
    store.getState().project!.cursorTrack!.samples.find((sample) => sample.id === firstSample.id)
  ).toMatchObject({ skinOverride: { color: '#ff00aa' } });
  expect(
    store.getState().project!.cursorTrack!.samples.find((sample) => sample.id === copiedFirst.id)
  ).toMatchObject({ skinOverride: { color: '#11aa00' } });
  const copiedKeys = duplicated.cursorFocusPath!.segments.find(
    (segment) =>
      segment.binding.kind === 'recording-source' &&
      segment.binding.sourceInstanceId === copy.sourceInstanceId
  )!.keys;
  expect(copiedKeys[0]).not.toBe(duplicated.cursorFocusPath!.segments[0]!.keys[0]);
  expect(copiedKeys.map((key) => key.id)).toEqual([
    `focus-override:${copy.sourceInstanceId}:raw-a`,
    `${copy.sourceInstanceId}:raw-b`,
    `end:segment:${copy.sourceInstanceId}:raw-b`,
  ]);
  store.getState().updateClipPlaybackRate(copy.id, 2);
  const rated = store.getState().project!;
  expect(
    rated.cursorTrack?.samples
      .filter((sample) => sample.sourceAnchor?.sourceClipId === copy.id)
      .at(-1)?.time
  ).toBeCloseTo(copy.startTime + copy.duration / 2);
  const reopened = hydrateVideoProject(JSON.parse(JSON.stringify(rated)));
  expect(reopened.cursorTrack?.sourceObservations).toEqual(rated.cursorTrack?.sourceObservations);
  expect(reopened.cursorTrack?.samples).toEqual(
    rated.cursorTrack?.samples.map((sample) => ({
      ...sample,
      skinOverride: sample.skinOverride ?? null,
    }))
  );
  store.getState().deleteClip(copy.id);
  const removed = store.getState();
  expect(removed.project!.cursorTrack?.sourceObservations).toHaveLength(1);
  const undo = undoVideoEditorProjectHistory(removed.projectHistory, removed.project!);
  if (undo?.status !== 'applied') throw new Error('Undo did not apply');
  expect(undo.project.cursorTrack?.sourceObservations).toEqual(
    rated.cursorTrack?.sourceObservations
  );
  expect(undo.project.cursorFocusPath).toEqual(rated.cursorFocusPath);
});
