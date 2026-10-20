import { expect, it } from 'vitest';
import { parseMotionBlurPhases, motionBlurPhaseSetting, editMotionBlurPhase } from './blur';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion } from './index';
import { applyVideoProjectMutationPatch } from '../mutation';
import { isHydratableVideoProject, parseHydratableVideoProject } from '../validation/root';
import { hydrateVideoProject } from '../hydration';

it('admits the shared Gallery phase shape without materializing absence', () => {
  expect(parseMotionBlurPhases(undefined)).toBeUndefined();
  expect(
    parseMotionBlurPhases({ enter: { enabled: false, strength: 0.713 }, ignored: 'drop' })
  ).toEqual({ enter: { enabled: false, strength: 0.713 } });
  for (const bad of [
    null,
    [],
    1,
    { enter: {} },
    { link: { enabled: 1, strength: 0.5 } },
    { exit: { enabled: true, strength: NaN } },
    { enter: { enabled: false, strength: 1.1 } },
    { link: { enabled: true, strength: -0.1 } },
  ])
    expect(parseMotionBlurPhases(bad)).toBeNull();
  expect(motionBlurPhaseSetting({}, 'enter', 0.8)).toEqual({ enabled: false, strength: 0.5 });
  expect(motionBlurPhaseSetting(undefined, 'exit', 0.8)).toEqual({ enabled: true, strength: 0.8 });
});

it('merges scalar phase edits and keeps disabled strength and untouched legacy phases', () => {
  const first = editMotionBlurPhase(undefined, 0.8, { phase: 'enter', enabled: false })!;
  expect(first).toEqual({
    enter: { enabled: false, strength: 0.8 },
    exit: { enabled: true, strength: 0.8 },
    link: { enabled: true, strength: 0.8 },
  });
  const next = editMotionBlurPhase(first, 0.8, { phase: 'link', strength: 0.731 })!;
  expect(next?.enter).toBe(first?.enter);
  expect(next?.link).toEqual({ enabled: true, strength: 0.731 });
  expect(editMotionBlurPhase(next, 0.8, { phase: 'link', enabled: true })).toBe(next);
  expect(editMotionBlurPhase(undefined, 0, { phase: 'enter', enabled: false })).toBeUndefined();
  expect(editMotionBlurPhase(next, 0.8, { phase: 'link', strength: NaN })).toBeNull();
});

it('admits phases only from schema17 and preserves them through hydration mutation and removal', () => {
  const project = createEmptyVideoProject('Phases', 1280, 720);
  project.duration = 6;
  const region = {
    ...createVideoProjectMotionRegion(project, 1),
    motionBlur: { enter: { enabled: false, strength: 0.731 } },
  };
  const changed = applyVideoProjectMutationPatch(project, { motionRegions: [region] });
  expect(changed.version).toBe(17);
  expect(isHydratableVideoProject(changed)).toBe(true);
  for (let version = 2; version < 17; version++)
    expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
  expect(isHydratableVideoProject({ ...changed, version: 22 })).toBe(false);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))?.motionRegions).toEqual(
    changed.motionRegions
  );
  expect(hydrateVideoProject(changed).motionRegions?.[0]?.motionBlur).toEqual(region.motionBlur);
  expect(
    hydrateVideoProject(project).motionRegions?.some((region) => region.motionBlur !== undefined)
  ).toBe(false);
  expect(applyVideoProjectMutationPatch(changed, { motionRegions: [] }).version).toBe(17);
});
