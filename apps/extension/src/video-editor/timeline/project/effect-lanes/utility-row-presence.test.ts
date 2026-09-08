import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
import { getTimelineUtilityRowPresence } from './segments';

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
