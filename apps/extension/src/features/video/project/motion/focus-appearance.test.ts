import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoProjectMotionRegion } from './index';
import { createQuickEditBorder, createQuickEditSpotlight } from '../scene/focus-appearance';
import { editMotionFocus, type MotionFocusEdit } from './focus-appearance';

it('keeps one active appearance and restores dormant camera authoring without reviving stale edits', () => {
  const project = createEmptyVideoProject('Mode');
  const camera = { ...createVideoProjectMotionRegion(project, 0), scale: 2.4, zoomInDuration: 0.7 };
  const spotlight = editMotionFocus(project, camera, { kind: 'spotlight', enabled: true })!;
  expect(spotlight).toEqual({
    ...camera,
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'viewport',
  });
  const border = editMotionFocus(project, spotlight, { kind: 'border', enabled: true })!;
  expect(border).toEqual({ ...camera, border: createQuickEditBorder(), borderTarget: 'viewport' });
  expect(
    editMotionFocus(project, border, { kind: 'spotlight', settings: { blur: 20 } })
  ).toBeNull();
  expect(editMotionFocus(project, border, { kind: 'spotlight', enabled: false })).toBe(border);
  const cleared = editMotionFocus(project, border, { kind: 'border', enabled: false })!;
  expect(cleared).toEqual(camera);
  expect(editMotionFocus(project, cleared, { kind: 'border', settings: { width: 7 } })).toBeNull();
  expect(camera).not.toHaveProperty('border');
  expect(camera).not.toHaveProperty('spotlight');
});

it('merges partial spotlight settings and area against accepted values while preserving dormant controls', () => {
  const project = createEmptyVideoProject('Merge');
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'viewport' as const,
  };
  const changed = editMotionFocus(project, region, {
    kind: 'spotlight',
    settings: { effect: 'blur', blur: 19, area: { x: 0.1 } },
  })!;
  const resized = editMotionFocus(project, changed, {
    kind: 'spotlight',
    settings: { area: { width: 0.8 } },
  })!;
  expect(resized.spotlight).toEqual({
    ...region.spotlight,
    effect: 'blur',
    blur: 19,
    area: { ...region.spotlight.area, x: 0.1, width: 0.8 },
  });
  expect(editMotionFocus(project, resized, { kind: 'spotlight', settings: {} })).toBe(resized);
  expect(editMotionFocus(project, resized, { kind: 'spotlight', enabled: true })).toBe(resized);
  expect(region.spotlight).toEqual(createQuickEditSpotlight());
});

it('switches a Native focus to an optical lens and validates subsequent scale edits', () => {
  const project = createEmptyVideoProject('Lens');
  const initial = createVideoProjectMotionRegion(project, 0);
  const lens = editMotionFocus(project, initial, {
    kind: 'spotlight',
    enabled: true,
    settings: { effect: 'magnify', magnification: 2.5, lensOptics: 'optical' },
  })!;
  expect(lens.spotlight).toMatchObject({
    effect: 'magnify',
    magnification: 2.5,
    lensOptics: 'optical',
  });
  expect(
    editMotionFocus(project, lens, { kind: 'spotlight', settings: { magnification: 3 } })?.spotlight
      ?.magnification
  ).toBe(3);
  expect(
    editMotionFocus(project, lens, { kind: 'spotlight', settings: { magnification: 9 } })
  ).toBeNull();
  expect(lens.spotlight?.magnification).toBe(2.5);
});

it.each([
  ['kind', 'invalid'],
  ['enabled', 'yes'],
  ['target', 'unknown'],
  ['settings', null],
  ['settings', { area: { width: 0 } }],
  ['settings', { area: { x: NaN } }],
  ['settings', { area: { width: 2 } }],
  ['settings', { blur: Infinity }],
  ['settings', { effect: 'unknown' }],
  ['settings', { strength: -0.1 }],
  ['settings', { area: { left: 0.2 } }],
])('refuses invalid %s edits without changing admitted appearance', (field, value) => {
  const project = createEmptyVideoProject();
  const region = {
    ...createVideoProjectMotionRegion(project, 0),
    spotlight: createQuickEditSpotlight(),
    spotlightTarget: 'viewport' as const,
  };
  const before = structuredClone(region);
  const edit: MotionFocusEdit = { kind: 'spotlight' };
  Reflect.set(edit, field, value);
  expect(editMotionFocus(project, region, edit)).toBeNull();
  expect(region).toEqual(before);
});

it('refuses unbound window and scene edits and disables only the requested active role', () => {
  const project = createEmptyVideoProject();
  const region = createVideoProjectMotionRegion(project, 0);
  for (const target of ['window', 'scene'] as const)
    expect(
      editMotionFocus(project, region, { kind: 'spotlight', enabled: true, target })
    ).toBeNull();
  const active = editMotionFocus(project, region, { kind: 'spotlight', enabled: true })!;
  expect(
    editMotionFocus(project, active, { kind: 'spotlight', enabled: false, settings: {} })
  ).toBeNull();
  expect(editMotionFocus(project, active, { kind: 'border', enabled: false })).toBe(active);
  expect(editMotionFocus(project, active, { kind: 'spotlight', enabled: false })).toEqual(region);
});
