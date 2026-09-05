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
  const event = {
    id: 'anchored',
    kind: 'CLICK' as const,
    time: 1,
    duration: 0.5,
    point: { x: 50, y: 50 },
    label: '',
    data: {},
    preset: 'CLICK_RIPPLE' as const,
    sourceAnchor: {
      kind: 'recording-source' as const,
      recordingId: 'rec',
      sourceClipId: first.id,
      sourceTime: 1,
    },
  };
  const region = {
    ...createVideoProjectMotionRegion(base, 0.75),
    duration: 1,
    targetActionEventId: event.id,
  };
  const { sourceAnchor: _sourceAnchor, ...manual } = event;
  store.setState({
    selection: { kind: 'clip', clipId: first.id },
    selectedTrackId: first.trackId,
    currentTime: 1.5,
    project: {
      ...base,
      actionEvents: [event, { ...manual, id: 'manual', time: 0.25, timeBasis: 'project' }],
      motionRegions: [region],
      cursorTrack: {
        captureMode: VideoCursorCaptureMode.SEPARATE,
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [
          { id: 'cursor', time: 1, x: 50, y: 50, visible: true, sourceAnchor: event.sourceAnchor },
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
  expect(after.project!.actionEvents.find((item) => item.id === event.id)).toMatchObject({
    time: 3,
    sourceAnchor: event.sourceAnchor,
  });
  expect(after.project!.actionEvents.find((item) => item.id === 'manual')?.time).toBe(0.25);
  expect(after.project!.motionRegions?.[0]).toMatchObject({ startTime: 2.75, duration: 1 });
  expect(after.project!.cursorTrack?.samples[0]).toMatchObject({
    time: 3,
    sourceAnchor: event.sourceAnchor,
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
