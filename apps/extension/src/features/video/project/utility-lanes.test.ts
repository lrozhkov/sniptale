import { expect, it } from 'vitest';
import {
  createDefaultVideoProjectUtilityLanes,
  getVideoProjectUtilityLanes,
  isVideoProjectUtilityLaneLocked,
  isVideoProjectUtilityLaneVisible,
} from './utility-lanes';

it('creates isolated default utility lane state', () => {
  const first = createDefaultVideoProjectUtilityLanes();
  const second = createDefaultVideoProjectUtilityLanes();

  first.actions.visible = false;

  expect(second.actions.visible).toBe(true);
});

it('merges partial project utility lanes with defaults', () => {
  const lanes = getVideoProjectUtilityLanes({
    utilityLanes: {
      actions: { visible: false },
      camera: { locked: true },
    },
  });

  expect(lanes.actions).toEqual({ locked: false, visible: false });
  expect(lanes.camera).toEqual({ locked: true, visible: true });
});

it('resolves lane visibility and lock helpers from normalized lane state', () => {
  const project = {
    utilityLanes: {
      actions: { visible: false },
      camera: { locked: true },
    },
  };

  expect(isVideoProjectUtilityLaneVisible(project, 'actions')).toBe(false);
  expect(isVideoProjectUtilityLaneVisible(project, 'camera')).toBe(true);
  expect(isVideoProjectUtilityLaneLocked(project, 'actions')).toBe(false);
  expect(isVideoProjectUtilityLaneLocked(project, 'camera')).toBe(true);
});
