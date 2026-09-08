import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { VideoTrackKind, VideoProjectTrackRole } from '../../../../features/video/project/types';
import { createVideoEditorProjectTrackActions } from './actions';
import type { VideoEditorProjectState } from '../contracts';
import {
  undoVideoEditorProjectHistory,
  redoVideoEditorProjectHistory,
  resetVideoEditorProjectHistory,
} from '../../history';

function createMutableState() {
  const project = createEmptyVideoProject('Draft');
  let state = {
    currentTime: 0,
    project,
    projectHistory: resetVideoEditorProjectHistory(project.id),
    selectedTrackId: null,
    selection: { kind: 'scene' },
  } as VideoEditorProjectState;
  const set = (
    updater:
      | Partial<VideoEditorProjectState>
      | ((state: VideoEditorProjectState) => Partial<VideoEditorProjectState>)
  ) => {
    const nextPatch = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...nextPatch };
  };

  return { getState: () => state, set };
}

it('combines structure and toggle track actions into one project track owner', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectTrackActions(runtime.set);
  const primaryTrackId = runtime.getState().project!.tracks[0]!.id;

  actions.addTrack(VideoTrackKind.AUDIO);
  actions.addTrackLogicalLane(primaryTrackId);
  actions.moveTrack(primaryTrackId, 'down');
  actions.toggleTrackVisibility(primaryTrackId);
  actions.toggleTrackLock(primaryTrackId);
  actions.toggleUtilityLaneVisibility('actions');
  actions.toggleUtilityLaneLock('camera');

  expect(runtime.getState().project?.tracks).toHaveLength(2);
  expect(runtime.getState().project?.utilityLanes).toEqual({
    actions: { visible: true, locked: false },
    camera: { visible: true, locked: true },
  });
  expect(runtime.getState().project?.tracks.find((track) => track.id === primaryTrackId)).toEqual(
    expect.objectContaining({
      locked: true,
      logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
      visible: false,
    })
  );
});

it('adds and selects an independent camera track with undo and redo', () => {
  const runtime = createMutableState();
  const actions = createVideoEditorProjectTrackActions(runtime.set);
  actions.addTrack(VideoTrackKind.PRIMARY, VideoProjectTrackRole.CAMERA);
  const state = runtime.getState();
  const camera = state.project!.tracks.at(-1)!;
  expect(camera).toMatchObject({
    kind: VideoTrackKind.PRIMARY,
    role: VideoProjectTrackRole.CAMERA,
    isRoot: false,
    visible: true,
    locked: false,
  });
  expect(state.selection).toEqual({ kind: 'track', trackId: camera.id });
  expect(state.selectedTrackId).toBe(camera.id);
  expect(state.project!.clips).toHaveLength(0);
  const undo = undoVideoEditorProjectHistory(state.projectHistory, state.project!);
  if (undo?.status !== 'applied') throw new Error('Expected undo');
  expect(undo.project.tracks.some((track) => track.id === camera.id)).toBe(false);
  const redo = redoVideoEditorProjectHistory(undo.history, undo.project);
  if (redo?.status !== 'applied') throw new Error('Expected redo');
  expect(redo.project.tracks.at(-1)).toEqual(camera);
  actions.addTrack(VideoTrackKind.PRIMARY, VideoProjectTrackRole.CAMERA);
  expect(runtime.getState().project!.tracks.at(-1)!.name).not.toBe(camera.name);
});
