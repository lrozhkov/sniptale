import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { getVideoProjectActionPresentation } from '../action-presentation';
import { isHydratableVideoProject } from './root';
import { createCameraFollowSettings } from '../camera/cursor-policy';
import { createVideoProjectMotionRegion } from '../motion';
import { applyVideoProjectMutationPatch } from '../mutation';

it('validates presentation defaults at the project boundary', () => {
  const project = createEmptyVideoProject('History');
  const defaults = getVideoProjectActionPresentation(project);
  expect(isHydratableVideoProject({ ...project, actionPresentation: defaults })).toBe(true);
  for (const patch of [
    { enabled: 'yes' },
    { duration: 0 },
    { duration: Infinity },
    { offset: NaN },
    { clickSuppressionInterval: -1 },
    { clickPreset: 'unknown' },
    { showKeystrokes: 1 },
  ]) {
    expect(
      isHydratableVideoProject({ ...project, actionPresentation: { ...defaults, ...patch } })
    ).toBe(false);
  }
  expect(isHydratableVideoProject({ ...project, actionPresentation: null })).toBe(false);
});

it('admits complete camera policy only at version four and preserves it across project mutations', () => {
  const project = createEmptyVideoProject('Camera policy');
  const cameraFollowDefaults = createCameraFollowSettings('calm');
  const cameraFollow = createCameraFollowSettings('fast');
  const motionRegions = [{ ...createVideoProjectMotionRegion(project, 0), cameraFollow }];
  const changed = applyVideoProjectMutationPatch(project, { cameraFollowDefaults, motionRegions });
  expect(changed.version).toBe(4);
  expect(isHydratableVideoProject(changed)).toBe(true);
  expect(isHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toBe(true);
  expect(isHydratableVideoProject({ ...changed, version: 3 })).toBe(false);
  expect(
    isHydratableVideoProject({
      ...changed,
      cameraFollowDefaults: { ...cameraFollowDefaults, zoneSize: NaN },
    })
  ).toBe(false);
  const renamed = applyVideoProjectMutationPatch(changed, { name: 'Renamed' });
  expect(renamed.version).toBe(4);
  expect(renamed.cameraFollowDefaults).toEqual(cameraFollowDefaults);
  expect(renamed.motionRegions).toEqual(motionRegions);
});
