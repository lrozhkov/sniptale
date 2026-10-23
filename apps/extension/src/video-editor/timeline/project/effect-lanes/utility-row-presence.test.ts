import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { getTimelineMotionLayout, getTimelineUtilityRowPresence } from './segments';

it('shows the zoom lane only while it contains an authored region', () => {
  const project = createEmptyVideoProject('Zoom');
  project.utilityLanes = {
    actions: { visible: true, locked: false },
    camera: { visible: false, locked: true },
  };
  expect(getTimelineUtilityRowPresence(project).motion).toBe(false);
  project.motionRegions = [createVideoProjectMotionRegion(project, 0)];
  expect(getTimelineUtilityRowPresence(project).motion).toBe(true);
  project.motionRegions = [];
  expect(getTimelineUtilityRowPresence(project).motion).toBe(false);
});

it('keeps hidden source intervals without reserving blank rows inside an active span', () => {
  const project = createEmptyVideoProject();
  project.motionRegions = [
    { ...createVideoProjectMotionRegion(project, 0), id: 'visible', duration: 4 },
    { ...createVideoProjectMotionRegion(project, 2), id: 'hidden', duration: 0 },
  ];
  const before = structuredClone(project);
  const layout = getTimelineMotionLayout(project);
  expect(layout.rowCount).toBe(1);
  expect(layout.rows.has('hidden')).toBe(false);
  expect(project).toEqual(before);
  project.motionRegions = [project.motionRegions[1]!];
  expect(getTimelineMotionLayout(project).rowCount).toBe(1);
});
