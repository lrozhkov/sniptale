import { expect, it } from 'vitest';
import {
  cameraTransitionProgress,
  cameraTransitionDerivative,
  fitCameraTransitionDurations,
  parseMotionPhaseTransitions,
} from './transitions';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion } from './index';
import { applyVideoProjectMutationPatch } from '../mutation';
import { isHydratableVideoProject, parseHydratableVideoProject } from '../validation/root';
import { hydrateVideoProject } from '../hydration';
import { editMotionTransitionPhase, motionTransitionSettings } from './timing';

it.each([
  ['linear', 0.25, 0.25, 1, 0],
  ['ease-in-out', 0.25, 0.15625, 1.125, 3],
  ['ease-in-out', 0.75, 0.84375, 1.125, -3],
  ['ease-out', 0.25, 0.4375, 1.5, -2],
  ['none', 0, 1, 0, 0],
  ['instant', 0, 0, 0, 0],
  ['instant', 0.25, 1, 0, 0],
] as const)('evaluates %s and its derivatives at %s', (type, t, value, first, second) => {
  expect(cameraTransitionProgress(t, type)).toBe(value);
  expect(cameraTransitionDerivative(t, type, 1)).toBe(first);
  expect(cameraTransitionDerivative(t, type, 2)).toBe(second);
});

it('fits active durations without consuming None time', () => {
  expect(
    fitCameraTransitionDurations(
      { type: 'linear', duration: 3 },
      { type: 'ease-in-out', duration: 3 },
      4
    )
  ).toEqual({ enter: 2, exit: 2 });
  expect(
    fitCameraTransitionDurations({ type: 'none', duration: 3 }, { type: 'linear', duration: 3 }, 4)
  ).toEqual({ enter: 0, exit: 3 });
  expect(
    fitCameraTransitionDurations(
      { type: 'linear', duration: 3 },
      { type: 'linear', duration: 2 },
      0
    )
  ).toEqual({ enter: 0, exit: 0 });
});

it('validates phase vocabulary while retaining missing legacy phases', () => {
  expect(parseMotionPhaseTransitions(undefined)).toBeUndefined();
  expect(parseMotionPhaseTransitions({ enter: 'ease-in-out', ignored: 'drop' })).toEqual({
    enter: 'ease-in-out',
  });
  for (const invalid of [null, [], 1, { enter: 'LINEAR' }, { exit: true }, { enter: NaN }])
    expect(parseMotionPhaseTransitions(invalid)).toBeNull();
  const project = createEmptyVideoProject('Phase settings');
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    duration: 4,
    zoomInDuration: 3,
    zoomOutDuration: 3,
  };
  expect(motionTransitionSettings(region, 'enter')).toMatchObject({ explicit: false, duration: 3 });
  const changed = editMotionTransitionPhase(region, { phase: 'enter', type: 'linear' })!;
  expect(changed.phaseTransitions).toEqual({ enter: 'linear' });
  expect(changed.zoomInDuration).toBe(1);
  expect(changed.zoomOutDuration).toBe(3);
  expect(motionTransitionSettings(changed, 'exit')).toMatchObject({ explicit: false, duration: 3 });
  expect(editMotionTransitionPhase(changed, { phase: 'enter', duration: 1 })).toBe(changed);
  expect(editMotionTransitionPhase(changed, { phase: 'enter', duration: 61 })).toBeNull();
  const none = editMotionTransitionPhase(changed, { phase: 'exit', type: 'none' })!;
  expect(none.zoomOutDuration).toBe(0);
  expect(none.phaseTransitions).toEqual({ enter: 'linear', exit: 'none' });
});

it('fences schema18 and retains settings through hydration JSON and clearing', () => {
  const project = createEmptyVideoProject('Phase settings');
  const region = createVideoProjectMotionRegion(project, 0, { enter: 'none', exit: 'ease-in-out' });
  const changed = applyVideoProjectMutationPatch(project, { motionRegions: [region] });
  expect(changed.version).toBe(18);
  expect(isHydratableVideoProject(changed)).toBe(true);
  expect(
    parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))?.motionRegions?.[0]
      ?.phaseTransitions
  ).toEqual(region.phaseTransitions);
  expect(
    hydrateVideoProject(JSON.parse(JSON.stringify(changed))).motionRegions?.[0]?.phaseTransitions
  ).toEqual(region.phaseTransitions);
  for (let version = 2; version < 18; version++)
    expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
  expect(isHydratableVideoProject({ ...changed, version: 20 })).toBe(false);
  const cleared = applyVideoProjectMutationPatch(changed, { motionRegions: [] });
  expect(cleared.version).toBe(18);
  const legacy = createVideoProjectMotionRegion(project, 0);
  expect(legacy).not.toHaveProperty('phaseTransitions');
  expect(
    hydrateVideoProject(applyVideoProjectMutationPatch(project, { motionRegions: [legacy] }))
      .motionRegions?.[0]
  ).not.toHaveProperty('phaseTransitions');
});

it.each(['enter', 'exit'] as const)(
  'bounds imported explicit %s duration without restricting legacy phases',
  (phase) => {
    const project = createEmptyVideoProject('Imported phase duration');
    const durationKey = phase === 'enter' ? 'zoomInDuration' : 'zoomOutDuration';
    const other = phase === 'enter' ? 'exit' : 'enter';
    const region = {
      ...createVideoProjectMotionRegion(project, 0),
      duration: 120,
      zoomInDuration: 0,
      zoomOutDuration: 0,
      [durationKey]: 60,
      phaseTransitions: { [phase]: 'linear' as const },
    };
    const candidate = applyVideoProjectMutationPatch(project, {
      duration: 120,
      motionRegions: [region],
    });
    expect(isHydratableVideoProject(candidate)).toBe(true);
    const overLimit = { ...region, [durationKey]: 61 };
    expect(isHydratableVideoProject({ ...candidate, motionRegions: [overLimit] })).toBe(false);
    const omitted = { ...overLimit, phaseTransitions: { [other]: 'linear' as const } };
    const legacyPhase = { ...candidate, motionRegions: [omitted] };
    expect(isHydratableVideoProject(legacyPhase)).toBe(true);
    expect(hydrateVideoProject(legacyPhase).motionRegions?.[0]?.[durationKey]).toBe(61);
    const { phaseTransitions: _phases, ...legacy } = overLimit;
    const oldProject = { ...candidate, version: 2 as const, motionRegions: [legacy] };
    expect(isHydratableVideoProject(oldProject)).toBe(true);
    expect(hydrateVideoProject(oldProject).motionRegions?.[0]?.[durationKey]).toBe(61);
  }
);
