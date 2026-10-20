import { expect, it } from 'vitest';
import {
  DEFAULT_CAMERA_DEPTH,
  DEFAULT_CAMERA_PERSPECTIVE,
  parseMotionSpatialReference,
} from './spatial';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion } from './index';
import { applyVideoProjectMutationPatch } from '../mutation';
import { isHydratableVideoProject, parseHydratableVideoProject } from '../validation/root';
import { hydrateVideoProject } from '../hydration';

const settings = {
  perspective: { ...DEFAULT_CAMERA_PERSPECTIVE, enabled: true, rotateX: 20, rotateY: -30 },
  depthOfField: { ...DEFAULT_CAMERA_DEPTH, enabled: true, mode: 'area' as const },
  spatialReference: { x: 0.1, y: 0.15, width: 0.8, height: 0.7 },
};
function setup() {
  const project = createEmptyVideoProject('Spatial contract', 800, 450);
  project.duration = 4;
  const region = { ...createVideoProjectMotionRegion(project, 0), duration: 4, ...settings };
  return { project, region };
}

it('fences authored spatial settings at schema nineteen and retains them through canonical reads', () => {
  const { project, region } = setup();
  const candidate = applyVideoProjectMutationPatch(project, { motionRegions: [region] });
  expect(candidate.version).toBe(19);
  const serialized: unknown = JSON.parse(JSON.stringify(candidate));
  expect(isHydratableVideoProject(serialized)).toBe(true);
  expect(parseHydratableVideoProject(serialized)?.motionRegions?.[0]).toMatchObject(settings);
  expect(hydrateVideoProject(candidate).motionRegions?.[0]).toMatchObject(settings);
  for (let version = 2; version <= 18; version++)
    for (const field of ['perspective', 'depthOfField', 'spatialReference'] as const)
      expect(
        isHydratableVideoProject({
          ...project,
          version,
          motionRegions: [
            { ...createVideoProjectMotionRegion(project, 0), [field]: settings[field] },
          ],
        })
      ).toBe(false);
  expect(isHydratableVideoProject({ ...candidate, version: 20 })).toBe(false);
  expect(applyVideoProjectMutationPatch(candidate, { motionRegions: [] }).version).toBe(19);
  const legacy = hydrateVideoProject(project);
  expect(legacy.version).toBe(project.version);
  expect(createVideoProjectMotionRegion(project, 0)).not.toHaveProperty('perspective');
  expect(createVideoProjectMotionRegion(project, 0)).not.toHaveProperty('depthOfField');
  expect(createVideoProjectMotionRegion(project, 0)).not.toHaveProperty('spatialReference');
});

it('refuses malformed spatial data without changing the source document', () => {
  const { project, region } = setup();
  const candidate = { ...project, version: 19, motionRegions: [region] };
  const before = structuredClone(candidate);
  for (const perspective of [
    null,
    [],
    {},
    { ...settings.perspective, rotateX: 61 },
    { ...settings.perspective, strength: NaN },
  ])
    expect(
      isHydratableVideoProject({ ...candidate, motionRegions: [{ ...region, perspective }] })
    ).toBe(false);
  for (const depthOfField of [
    null,
    {},
    { ...settings.depthOfField, softness: 0 },
    { ...settings.depthOfField, mode: 'unknown' },
    { ...settings.depthOfField, enabled: 'true' },
  ])
    expect(
      isHydratableVideoProject({ ...candidate, motionRegions: [{ ...region, depthOfField }] })
    ).toBe(false);
  for (const spatialReference of [
    null,
    {},
    { x: 0, y: 0, width: 0, height: 1 },
    { ...settings.spatialReference, x: -0.01 },
    { ...settings.spatialReference, width: 1 },
    { ...settings.spatialReference, height: Infinity },
  ])
    expect(
      isHydratableVideoProject({ ...candidate, motionRegions: [{ ...region, spatialReference }] })
    ).toBe(false);
  expect(candidate).toEqual(before);
});

it('accepts only a positive normalized reference with the declared floating edge tolerance', () => {
  expect(parseMotionSpatialReference(undefined)).toBeUndefined();
  expect(parseMotionSpatialReference({ x: 0.1, y: 0, width: 0.9 + 5e-10, height: 1 })).toEqual({
    x: 0.1,
    y: 0,
    width: 0.9 + 5e-10,
    height: 1,
  });
  expect(parseMotionSpatialReference({ x: 0.1, y: 0, width: 0.9 + 2e-9, height: 1 })).toBeNull();
  expect(parseMotionSpatialReference({ x: 0, y: 0, width: 1, height: 1, matrix: [1, 2] })).toEqual({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
});
