import { beforeEach, expect, it, vi } from 'vitest';

const mutations = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  reset: vi.fn(),
  setDefault: vi.fn(),
  toggle: vi.fn(),
  update: vi.fn(),
  updateOrder: vi.fn(),
}));
vi.mock('../../../../../composition/persistence/step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/step-badge-presets')
  >()),
  createUserStepBadgePreset: mutations.create,
  deleteStoredStepBadgePreset: mutations.delete,
  resetStoredSystemStepBadgePreset: mutations.reset,
  setDefaultStoredStepBadgePreset: mutations.setDefault,
  setStoredStepBadgePresetEnabled: mutations.toggle,
  updateStoredStepBadgePreset: mutations.update,
  updateStoredStepBadgePresetOrder: mutations.updateOrder,
}));

import {
  createSystemStepBadgePresetCatalog,
  SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION,
} from '../../../../../features/highlighter/step-badge-presets/catalog';
import { createStepBadgePresetCatalogActions } from './controller-actions';

beforeEach(() => {
  for (const mutation of Object.values(mutations))
    mutation.mockReset().mockResolvedValue({ outcome: 'applied' });
});

it('routes catalog edits, ordering, toggles, and system-only reset semantics', async () => {
  const system = createSystemStepBadgePresetCatalog()[0]!;
  const user = {
    ...system,
    id: 'user',
    origin: 'user' as const,
    enabled: false,
    tagIds: ['review'],
  };
  const catalog = {
    defaultPresetId: system.id,
    presets: [system, user],
    systemCatalogRevision: SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION,
  };
  const setEditor = vi.fn();
  const mutate = vi.fn(async (operation: () => Promise<{ outcome: string }>) => {
    await operation();
    return true;
  });
  const actions = createStepBadgePresetCatalogActions({ catalog, mutate, setEditor });

  actions.add();
  actions.edit(user);
  actions.closeEditor();
  await actions.delete(system);
  await actions.delete(user);
  await actions.moveBefore(user.id, system.id);
  await actions.moveBefore('missing', null);
  await actions.reset(system.id);
  await actions.setDefault(user.id);
  await actions.toggle(user.id);
  await actions.toggle('missing');

  expect(mutations.delete).toHaveBeenCalledOnce();
  expect(mutations.updateOrder).toHaveBeenCalledWith([user.id, system.id]);
  expect(mutations.reset).toHaveBeenCalledWith(system.id);
  expect(mutations.setDefault).toHaveBeenCalledWith(user.id);
  expect(mutations.toggle).toHaveBeenCalledWith(user.id, true);
  expect(setEditor).toHaveBeenCalledWith({ isOpen: true, preset: user });
});

it('creates or updates with tag metadata and closes only after a successful save', async () => {
  const system = createSystemStepBadgePresetCatalog()[0]!;
  const user = { ...system, id: 'user', origin: 'user' as const, tagIds: ['review'] };
  const setEditor = vi.fn();
  const mutate = vi.fn(async (operation: () => Promise<{ outcome: string }>) => {
    await operation();
    return true;
  });
  const existing = createStepBadgePresetCatalogActions({
    catalog: {
      defaultPresetId: system.id,
      presets: [system, user],
      systemCatalogRevision: SYSTEM_STEP_BADGE_PRESET_CATALOG_REVISION,
    },
    mutate,
    setEditor,
  });
  await existing.save(user);
  expect(mutations.update).toHaveBeenCalledWith(expect.objectContaining({ tagIds: ['review'] }));

  const fresh = createStepBadgePresetCatalogActions({ catalog: null, mutate, setEditor });
  await fresh.moveBefore(user.id, null);
  await fresh.save(user);
  expect(mutations.create).toHaveBeenCalledWith(expect.objectContaining({ tagIds: ['review'] }));
  expect(setEditor).toHaveBeenLastCalledWith({ isOpen: false });
});
