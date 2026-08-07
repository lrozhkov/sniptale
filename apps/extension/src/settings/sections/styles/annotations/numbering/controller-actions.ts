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

type StepBadgePresetMutate = (
  operation: () => Promise<{ outcome: string }>,
  success?: Parameters<typeof import('../../../../../platform/i18n').translate>[0]
) => Promise<boolean>;

function reorder(catalog: StepBadgePresetCatalog, sourceId: string, targetId: string) {
  const source = catalog.presets.findIndex((preset) => preset.id === sourceId);
  const target = catalog.presets.findIndex((preset) => preset.id === targetId);
  if (source < 0 || target < 0) return catalog.presets;
  const next = [...catalog.presets];
  const [moved] = next.splice(source, 1);
  if (moved) next.splice(target, 0, moved);
  return next;
}

export function createStepBadgePresetDragActions(args: {
  catalog: StepBadgePresetCatalog | null;
  draggedId: string | null;
  mutate: StepBadgePresetMutate;
  reset: () => void;
  setDraggedId: (id: string | null) => void;
  setDragOverId: (id: string | null) => void;
}): Pick<
  StepBadgePresetCatalogController['actions'],
  'dragEnd' | 'dragLeave' | 'dragOver' | 'dragStart' | 'drop'
> {
  return {
    dragEnd: args.reset,
    dragLeave: () => args.setDragOverId(null),
    dragOver: (event, id) => {
      event.preventDefault();
      if (args.draggedId && args.draggedId !== id) args.setDragOverId(id);
    },
    dragStart: (event, id) => {
      event.dataTransfer.effectAllowed = 'move';
      args.setDraggedId(id);
    },
    drop: async (event, id) => {
      event.preventDefault();
      if (args.catalog && args.draggedId && args.draggedId !== id) {
        const next = reorder(args.catalog, args.draggedId, id);
        await args.mutate(() => updateStoredStepBadgePresetOrder(next.map((preset) => preset.id)));
      }
      args.reset();
    },
  };
}

export function createStepBadgePresetCatalogActions(args: {
  catalog: StepBadgePresetCatalog | null;
  mutate: StepBadgePresetMutate;
  setEditor: (editor: StepBadgePresetCatalogController['editor']) => void;
  setHoveredId: (id: string | null) => void;
}): Omit<
  StepBadgePresetCatalogController['actions'],
  'dragEnd' | 'dragLeave' | 'dragOver' | 'dragStart' | 'drop'
> {
  return {
    add: () => args.setEditor({ isOpen: true }),
    closeEditor: () => args.setEditor({ isOpen: false }),
    delete: async (preset) => {
      if (preset.origin !== 'system')
        await args.mutate(
          () => deleteStoredStepBadgePreset(preset.id),
          'highlighter.stepBadgePresets.messages.deleted'
        );
    },
    edit: (preset) => args.setEditor({ isOpen: true, preset }),
    hover: args.setHoveredId,
    reset: async (id) => {
      await args.mutate(
        () => resetStoredSystemStepBadgePreset(id),
        'highlighter.stepBadgePresets.messages.reset'
      );
    },
    save: async (preset) => {
      const exists = args.catalog?.presets.some((item) => item.id === preset.id) ?? false;
      const saved = await args.mutate(
        () =>
          exists
            ? updateStoredStepBadgePreset({
                id: preset.id,
                name: preset.name,
                settings: preset.settings,
              })
            : createUserStepBadgePreset({ name: preset.name, settings: preset.settings }),
        exists
          ? 'highlighter.stepBadgePresets.messages.updated'
          : 'highlighter.stepBadgePresets.messages.created'
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
