import { expect, it } from 'vitest';
import {
  parseSceneBackgroundSettings,
  resolveSceneBackgroundKind,
  retainSceneBackgroundVariants,
} from './background-settings';
import { createSceneGradientBackground } from './background-gradient';
import { getProjectSceneBackground, syncProjectSceneBackground } from './background';
import { createEmptyVideoProject } from '../factories/creation';
import { applyVideoProjectMutationPatch } from '../mutation';
import {
  isHydratableVideoProject,
  isExportReadyVideoProject,
  parseHydratableVideoProject,
} from '../validation/root';
import type { VideoProjectSceneBackground } from '../types';

it('retains all three authored variants, animation and fit without recursive memory', () => {
  let project = {
    backgroundColor: '#123456',
    sceneBackground: { kind: 'solid', color: '#123456' } as VideoProjectSceneBackground,
  };
  const gradient = {
    ...createSceneGradientBackground('#abcdefff'),
    animation: { mode: 'breathe' as const, speed: 72, intensity: 61 },
  };
  project = syncProjectSceneBackground(project, gradient);
  project = syncProjectSceneBackground(project, {
    kind: 'image',
    assetId: 'original-image',
    imageFit: 'contain',
  });
  const original = structuredClone(project);
  for (const kind of ['solid', 'gradient', 'image'] as const) {
    const restored = resolveSceneBackgroundKind(project.sceneBackground, kind, 'wrong-first-image');
    expect(restored).not.toBeNull();
    project = syncProjectSceneBackground(project, restored!);
    expect(project.sceneBackground.kind).toBe(kind);
    if (kind === 'solid') expect(project.sceneBackground).toMatchObject({ color: '#123456' });
    if (kind === 'gradient') expect(project.sceneBackground).toMatchObject(gradient);
    if (kind === 'image')
      expect(project.sceneBackground).toMatchObject({
        assetId: 'original-image',
        imageFit: 'contain',
      });
  }
  for (const value of Object.values(project.sceneBackground.remembered!))
    expect(value).not.toHaveProperty('remembered');
  expect(original.sceneBackground.kind).toBe('image');
  expect(parseSceneBackgroundSettings(JSON.parse(JSON.stringify(project.sceneBackground)))).toEqual(
    project.sceneBackground
  );
});

it('copies admitted metadata and refuses malformed or recursive retained variants', () => {
  const valid = {
    kind: 'solid',
    color: '#123456',
    remembered: { image: { kind: 'image', assetId: 'image', imageFit: 'contain' } },
  };
  const parsed = parseSceneBackgroundSettings(valid);
  expect(parsed).toEqual(valid);
  expect(parsed).not.toBe(valid);
  expect(parsed?.remembered).not.toBe(valid.remembered);
  expect(parsed?.remembered?.image).not.toBe(valid.remembered.image);
  const gradient = createSceneGradientBackground();
  for (const value of [
    null,
    [],
    {},
    { kind: 'image', assetId: 'x', imageFit: 'stretch' },
    { kind: 'solid', color: '#123', imageFit: 'cover' },
    { ...valid, remembered: null },
    { ...valid, remembered: [] },
    { ...valid, remembered: { unknown: {} } },
    { ...valid, remembered: { image: gradient } },
    { ...valid, remembered: { image: { kind: 'image', assetId: 'x', remembered: {} } } },
    {
      ...valid,
      remembered: { gradient: { ...gradient, animation: { mode: 'bad', speed: 1, intensity: 1 } } },
    },
    { ...gradient, animation: { mode: 'rotate', speed: NaN, intensity: 1 } },
    { ...gradient, animation: { mode: 'rotate', speed: 1, intensity: 101 } },
  ])
    expect(parseSceneBackgroundSettings(value)).toBeNull();
});

it('keeps legacy reads free of defaults and retains latest memory during stale field edits', () => {
  const legacy = { backgroundColor: '#123456' };
  expect(getProjectSceneBackground(legacy)).toEqual({ kind: 'solid', color: '#123456' });
  expect(legacy).not.toHaveProperty('sceneBackground');
  const image = { kind: 'image' as const, assetId: 'image' };
  expect(parseSceneBackgroundSettings(image)).toEqual(image);
  expect(resolveSceneBackgroundKind(image, 'image')).toBe(image);
  expect(resolveSceneBackgroundKind({ kind: 'solid', color: '#123' }, 'image')).toBeNull();
  const previous = {
    ...image,
    remembered: { solid: { kind: 'solid' as const, color: '#123456' } },
  };
  const next = retainSceneBackgroundVariants(previous, {
    ...image,
    imageFit: 'contain',
    remembered: { solid: { kind: 'solid', color: '#ffffff' } },
  });
  expect(next.remembered?.solid?.color).toBe('#123456');
});

it('fences active and dormant metadata at schema fourteen and preserves removal', () => {
  const project = createEmptyVideoProject('Background');
  const image = {
    id: 'image',
    type: 'IMAGE' as const,
    name: 'background',
    createdAt: 0,
    metadata: {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 100,
      width: 50,
      mimeType: 'image/png',
      size: 100,
    },
    source: { kind: 'recording' as const, recordingId: 'image-source' },
  };
  const changed = applyVideoProjectMutationPatch(project, {
    assets: [image],
    sceneBackground: { kind: 'image', assetId: image.id, imageFit: 'contain' },
  });
  expect(changed.version).toBe(14);
  expect(isHydratableVideoProject(changed)).toBe(true);
  expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
  const dormant = applyVideoProjectMutationPatch(changed, {
    sceneBackground: {
      kind: 'solid',
      color: '#123456',
      remembered: { image: { kind: 'image', assetId: image.id } },
    },
  });
  expect(isExportReadyVideoProject(dormant)).toBe(true);
  expect(isExportReadyVideoProject({ ...dormant, assets: [] })).toBe(false);
  for (const background of [
    changed.sceneBackground,
    dormant.sceneBackground,
    { kind: 'solid', color: '#123456', remembered: {} },
  ]) {
    for (let version = 2; version <= 13; version++)
      expect(isHydratableVideoProject({ ...changed, version, sceneBackground: background })).toBe(
        false
      );
  }
  expect(isHydratableVideoProject({ ...changed, version: 20 })).toBe(false);
  expect(
    applyVideoProjectMutationPatch(changed, {
      sceneBackground: { kind: 'solid', color: '#123456' },
    }).version
  ).toBe(14);
  for (let version = 2; version <= 14; version++)
    expect(isHydratableVideoProject({ ...project, version })).toBe(true);
});

it('retains common blur through kind changes without putting it in paint memory', () => {
  let project = {
    backgroundColor: '#123456',
    sceneBackground: {
      ...createSceneGradientBackground(),
      blur: 18,
    } as VideoProjectSceneBackground,
  };
  for (const kind of ['image', 'solid', 'gradient'] as const) {
    const next = resolveSceneBackgroundKind(project.sceneBackground, kind, 'background-image')!;
    expect(next.blur).toBe(18);
    project = syncProjectSceneBackground(project, next);
    expect(project.sceneBackground.blur).toBe(18);
    for (const variant of Object.values(project.sceneBackground.remembered ?? {}))
      expect(variant).not.toHaveProperty('blur');
  }
  const reset = syncProjectSceneBackground(project, { kind: 'solid', color: '#abcdef', blur: 0 });
  expect(reset.sceneBackground.blur).toBe(0);
  expect(
    syncProjectSceneBackground(project, { kind: 'solid', color: '#abcdef' }).sceneBackground.blur
  ).toBe(18);
});

it('admits bounded common blur only at schema sixteen and keeps absent legacy values absent', () => {
  const base = createEmptyVideoProject('Blur');
  for (const blur of [0, 0.000123, 18, 25]) {
    const sceneBackground = { ...createSceneGradientBackground(), blur };
    const changed = applyVideoProjectMutationPatch(base, { sceneBackground });
    expect(changed.version).toBe(16);
    expect(parseHydratableVideoProject(JSON.parse(JSON.stringify(changed)))).toEqual(changed);
    for (let version = 2; version <= 15; version++)
      expect(isHydratableVideoProject({ ...changed, version })).toBe(false);
    expect(isHydratableVideoProject({ ...changed, version: 20 })).toBe(false);
    expect(
      applyVideoProjectMutationPatch(changed, {
        sceneBackground: { kind: 'solid', color: '#123456' },
      }).version
    ).toBe(16);
  }
  for (const blur of [-1, 25.01, NaN, Infinity, '4', null])
    expect(parseSceneBackgroundSettings({ kind: 'solid', color: '#123456', blur })).toBeNull();
  for (const kind of ['solid', 'gradient', 'image'] as const) {
    const variant =
      kind === 'solid'
        ? { kind, color: '#123456' }
        : kind === 'image'
          ? { kind, assetId: 'image' }
          : createSceneGradientBackground();
    expect(
      parseSceneBackgroundSettings({
        kind: 'solid',
        color: '#123456',
        remembered: { [kind]: { ...variant, blur: 1 } },
      })
    ).toBeNull();
  }
  for (let version = 2; version <= 16; version++) {
    const legacy = { ...base, version };
    expect(isHydratableVideoProject(legacy)).toBe(true);
    expect(getProjectSceneBackground(legacy)).not.toHaveProperty('blur');
  }
});
