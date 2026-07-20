import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import { createProjectTrackToggleActions } from './groups';
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

  return {
    getState: () => state,
    replaceState: (nextState: VideoEditorProjectState) => {
      state = nextState;
    },
    set,
  };
}

it('updates utility lane visibility, lock, and clear state through project updates', () => {
  const runtime = createMutableState();
  const toggles = createProjectTrackToggleActions(runtime.set);

  seedUtilityLaneOwners(runtime);
  toggles.toggleUtilityLaneVisibility('actions');
  expect(getVideoProjectUtilityLanes(runtime.getState().project!).actions.visible).toBe(false);
  expect(runtime.getState().selection).toEqual({
    kind: 'action-segment',
    actionEventId: 'action-1',
  });

  toggles.clearUtilityLane('actions');
  expect(runtime.getState().project?.actionEvents).toEqual([]);
  toggles.clearUtilityLane('camera');
  expect(runtime.getState().project?.motionRegions).toEqual([]);

  seedUtilityLaneOwners(runtime);
  toggles.toggleUtilityLaneLock('camera');
  toggles.clearUtilityLane('camera');
  expect(runtime.getState().project?.motionRegions).toHaveLength(1);
});

function seedUtilityLaneOwners(runtime: ReturnType<typeof createMutableState>) {
  runtime.replaceState({
    ...runtime.getState(),
    project: {
      ...runtime.getState().project!,
      actionEvents: [createUtilityLaneActionEvent()],
      motionRegions: [createUtilityLaneMotionRegion()],
    },
    selection: { kind: 'action-segment', actionEventId: 'action-1' },
  });
}

function createUtilityLaneActionEvent() {
  return {
    data: {},
    duration: 0.7,
    id: 'action-1',
    kind: 'CLICK',
    label: 'Click',
    point: null,
    preset: 'CLICK_RIPPLE',
    time: 1,
  } as never;
}

function createUtilityLaneMotionRegion() {
  return {
    duration: 1,
    easing: 'LINEAR',
    focusMode: 'MANUAL',
    focusPoint: null,
    id: 'motion-1',
    scale: 1.2,
    startTime: 0,
    targetActionEventId: null,
    zoomInDuration: 0,
    zoomOutDuration: 0,
  } as never;
}
