import type { StepBadgePresetCatalog } from '@sniptale/runtime-contracts/highlighter/step-badge';
import {
  createUserStepBadgePreset,
  deleteStoredStepBadgePreset,
  resetStoredSystemStepBadgePreset,
  setDefaultStoredStepBadgePreset,
  setStoredStepBadgePresetEnabled,
  updateStoredStepBadgePreset,
  updateStoredStepBadgePresetOrder,
} from '../../../../../composition/persistence/step-badge-presets';
import type { StepBadgePresetCatalogController } from './types';

type StepBadgePresetMutate = (operation: () => Promise<{ outcome: string }>) => Promise<boolean>;
type StepBadgeCatalogActions = Omit<
  StepBadgePresetCatalogController['actions'],
  'setNewSessionEnabled' | 'setNewSessionTemplateSource'
>;

function reorderBefore(catalog: StepBadgePresetCatalog, sourceId: string, beforeId: string | null) {
  const next = catalog.presets.filter((preset) => preset.id !== sourceId);
  const moved = catalog.presets.find((preset) => preset.id === sourceId);
  if (!moved) return catalog.presets;
  const target =
    beforeId === null ? next.length : next.findIndex((preset) => preset.id === beforeId);
  if (target < 0) return catalog.presets;
  next.splice(target, 0, moved);
  return next;
}

export function createStepBadgePresetCatalogActions(args: {
  catalog: StepBadgePresetCatalog | null;
  mutate: StepBadgePresetMutate;
  setEditor: (editor: StepBadgePresetCatalogController['editor']) => void;
}): StepBadgeCatalogActions {
  return {
    add: () => args.setEditor({ isOpen: true }),
    closeEditor: () => args.setEditor({ isOpen: false }),
    delete: async (preset) => {
      if (preset.origin !== 'system')
        await args.mutate(() => deleteStoredStepBadgePreset(preset.id));
    },
    edit: (preset) => args.setEditor({ isOpen: true, preset }),
    moveBefore: async (id, beforeId) => {
      if (!args.catalog) return;
      const next = reorderBefore(args.catalog, id, beforeId);
      await args.mutate(() => updateStoredStepBadgePresetOrder(next.map((preset) => preset.id)));
    },
    reset: async (id) => {
      await args.mutate(() => resetStoredSystemStepBadgePreset(id));
    },
    save: async (preset) => {
      const exists = args.catalog?.presets.some((item) => item.id === preset.id) ?? false;
      const saved = await args.mutate(() =>
        exists
          ? updateStoredStepBadgePreset({
              id: preset.id,
              name: preset.name,
              settings: preset.settings,
              tagIds: preset.tagIds,
            })
          : createUserStepBadgePreset({
              name: preset.name,
              settings: preset.settings,
              tagIds: preset.tagIds,
            })
      );
      if (saved) args.setEditor({ isOpen: false });
    },
    setDefault: async (id) => {
      await args.mutate(() => setDefaultStoredStepBadgePreset(id));
    },
    toggle: async (id) => {
      const preset = args.catalog?.presets.find((item) => item.id === id);
      if (preset)
        await args.mutate(() => setStoredStepBadgePresetEnabled(id, preset.enabled === false));
    },
  };
}
