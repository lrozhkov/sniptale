import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../../features/video/project/types';
import { createVideoEditorProjectTrackActions } from './actions';
import type { VideoEditorProjectState } from '../contracts';

function createMutableState() {
  let state = {
    currentTime: 0,
    project: createEmptyVideoProject('Draft'),
    selectedClipId: null,
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

  expect(runtime.getState().project?.tracks).toHaveLength(4);
  expect(runtime.getState().project?.utilityLanes).toEqual({
    actions: { visible: false, locked: false },
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
