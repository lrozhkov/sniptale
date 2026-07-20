import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from './test-store.test-support';

function createStoreState() {
  return createVideoEditorProjectTestStore();
}

it('keeps locked utility lanes read-only for action and motion mutations', () => {
  const store = createStoreState();
  store.getState().setProject(createUtilityLockedProject());

  store.getState().updateActionEventDetails('action-1', { label: 'Blocked' });
  store.getState().deleteActionEvent('action-1');
  store.getState().updateMotionRegion('motion-1', { scale: 3 });
  store.getState().deleteMotionRegion('motion-1');

  expect(store.getState().project?.actionEvents).toHaveLength(1);
  expect(store.getState().project?.actionEvents[0]?.label).toBe('Click');
  expect(store.getState().project?.motionRegions).toHaveLength(1);
  expect(store.getState().project?.motionRegions?.[0]?.scale).toBe(1.4);
});

it('updates and deletes utility lane effects when lanes are editable', () => {
  const store = createStoreState();
  store.getState().setProject(createUtilityEditableProject());

  store.getState().updateActionEventDetails('action-1', {
    label: 'Spotlight',
    point: { x: 9999, y: -10 },
    preset: VideoProjectActionPreset.SPOTLIGHT,
  });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.CALLOUT);
  store.getState().updateActionEventDetails('action-1', {
    preset: VideoProjectActionPreset.DWELL_ZOOM,
  });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.PAUSE);
  store.getState().updateActionEventDetails('action-1', {
    preset: VideoProjectActionPreset.SCROLL_EMPHASIS,
  });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.SCROLL);
  store.getState().updateActionEventDetails('action-1', { preset: VideoProjectActionPreset.NONE });
  store.getState().updateMotionRegion('motion-1', {
    duration: 4,
    scale: 5,
    zoomOutDuration: 8,
  });

  expect(store.getState().project?.actionEvents[0]).toEqual(
    expect.objectContaining({
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Spotlight',
      point: { x: 1920, y: 0 },
    })
  );
  expect(store.getState().project?.motionRegions?.[0]).toEqual(
    expect.objectContaining({ scale: 4 })
  );

  store.getState().deleteActionEvent('action-1');
  store.getState().deleteActionEvent('missing-action');
  store.getState().deleteMotionRegion('motion-1');
  store.getState().deleteMotionRegion('missing-motion');
  expect(store.getState().project?.actionEvents).toEqual([]);
  expect(store.getState().project?.motionRegions).toEqual([]);
});

function createUtilityLockedProject() {
  return {
    ...createUtilityEditableProject(),
    utilityLanes: {
      actions: { visible: true, locked: true },
      camera: { visible: true, locked: true },
    },
  };
}

function createUtilityEditableProject() {
  const project = createEmptyVideoProject('Utility lock');
  project.duration = 10;
  project.actionEvents = [
    {
      data: {},
      duration: 0.7,
      id: 'action-1',
      kind: VideoProjectActionEventKind.CLICK,
      label: 'Click',
      point: null,
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
      time: 1,
    },
  ];
  project.motionRegions = [
    {
      duration: 1.4,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.MANUAL,
      focusPoint: null,
      id: 'motion-1',
      scale: 1.4,
      startTime: 0,
      targetActionEventId: null,
      zoomInDuration: 0.2,
      zoomOutDuration: 0.2,
    },
  ];
  return project;
}
