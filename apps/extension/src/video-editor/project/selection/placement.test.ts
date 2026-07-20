import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  type VideoProjectMotionArea,
  VideoTemporalEasing,
  type VideoProjectActionEvent,
  type VideoProjectMotionRegion,
} from '../../../features/video/project/types';
import {
  createActionPointPlacementMode,
  createMotionAreaPlacementMode,
  createMotionFocusPlacementMode,
  resolvePlacementModeAfterProjectUpdate,
  resolvePlacementModeAfterSelectionChange,
} from './placement';

describe('video editor placement', () => {
  it('keeps placement mode only for the matching selection owner', verifySelectionPlacementRules);
  it(
    'drops placement mode when the referenced owner disappears from the project',
    verifyProjectPlacementRules
  );
});

function verifySelectionPlacementRules() {
  expect(
    resolvePlacementModeAfterSelectionChange(
      { kind: 'action-segment', actionEventId: 'action-1' },
      createActionPointPlacementMode('action-1')
    )
  ).toEqual(createActionPointPlacementMode('action-1'));

  expect(
    resolvePlacementModeAfterSelectionChange(
      { kind: 'motion-region', motionRegionId: 'motion-1' },
      createActionPointPlacementMode('action-1')
    )
  ).toBeNull();
}

function verifyProjectPlacementRules() {
  const project = createPlacementProject();
  const motionRegions = project.motionRegions ?? [];

  expect(
    resolvePlacementModeAfterProjectUpdate(project, createActionPointPlacementMode('action-1'))
  ).toEqual(createActionPointPlacementMode('action-1'));
  expect(
    resolvePlacementModeAfterProjectUpdate(project, createMotionFocusPlacementMode('motion-1'))
  ).toEqual(createMotionFocusPlacementMode('motion-1'));
  expect(
    resolvePlacementModeAfterProjectUpdate(project, createMotionAreaPlacementMode('motion-2'))
  ).toEqual(createMotionAreaPlacementMode('motion-2'));

  project.motionRegions = motionRegions.map((region) => ({
    ...region,
    focusMode: VideoMotionFocusMode.CURSOR,
  }));

  expect(
    resolvePlacementModeAfterProjectUpdate(project, createMotionFocusPlacementMode('motion-1'))
  ).toBeNull();
  expect(
    resolvePlacementModeAfterProjectUpdate(project, createMotionAreaPlacementMode('motion-2'))
  ).toBeNull();

  project.motionRegions = motionRegions.map((region) =>
    region.id === 'motion-2' ? { ...region, focusMode: VideoMotionFocusMode.MANUAL } : region
  );

  expect(
    resolvePlacementModeAfterProjectUpdate(project, createMotionAreaPlacementMode('motion-2'))
  ).toBeNull();

  project.actionEvents = [];
  project.motionRegions = [];

  expect(
    resolvePlacementModeAfterProjectUpdate(project, createActionPointPlacementMode('action-1'))
  ).toBeNull();
  expect(
    resolvePlacementModeAfterProjectUpdate(project, createMotionFocusPlacementMode('motion-1'))
  ).toBeNull();
}

function createPlacementProject() {
  const project = createEmptyVideoProject('Placement');
  project.actionEvents = [createPlacementActionEvent()];
  project.motionRegions = [
    createPlacementMotionRegion('motion-1', VideoMotionFocusMode.MANUAL, null),
    createPlacementMotionRegion('motion-2', VideoMotionFocusMode.MANUAL_AREA, {
      x: 40,
      y: 60,
      width: 220,
      height: 180,
    }),
  ];
  return project;
}

function createPlacementActionEvent(): VideoProjectActionEvent {
  return {
    data: {},
    duration: 0.3,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Action',
    point: { x: 20, y: 30 },
    preset: VideoProjectActionPreset.CLICK_RIPPLE,
    time: 0.2,
  };
}

function createPlacementMotionRegion(
  id: string,
  focusMode: VideoProjectMotionRegion['focusMode'],
  focusArea: VideoProjectMotionArea | null
): VideoProjectMotionRegion {
  return {
    duration: id === 'motion-2' ? 1.2 : 1.4,
    easing: VideoTemporalEasing.LINEAR,
    focusArea,
    focusMode,
    focusPoint: id === 'motion-2' ? { x: 150, y: 150 } : { x: 100, y: 80 },
    id,
    motionBlurAmount: 0,
    scale: 1.4,
    startTime: id === 'motion-2' ? 0.5 : 0,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  };
}
