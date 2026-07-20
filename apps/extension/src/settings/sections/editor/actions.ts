import type { EditorPaletteSettings } from '../../../features/editor/document/presets';
import { translate } from '../../../platform/i18n';
import {
  deleteBorderPreset,
  setBorderPresetEnabled,
  setDefaultBorderPreset,
  updateBorderPresetsOrder,
} from '../../../composition/persistence/highlighter';
import {
  deleteEditorPreset,
  saveEditorPaletteSettings,
  setDefaultEditorPreset,
  setEditorPresetEnabled,
  updateEditorPresetOrder,
} from '../../../composition/persistence/editor-presets';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { type EditorSettingsPaletteKey, type EditorSettingsPresetOwner } from './families';
import { reorderItemIds, updatePaletteOrder } from './logic';

type PresetActionArgs = {
  currentPresets: ReadonlyArray<{ id: string }>;
  draggedPresetId: string | null;
  presetOwner: EditorSettingsPresetOwner;
  setDraggedPresetId: (value: string | null) => void;
  setDragOverPresetId: (value: string | null) => void;
};

type PaletteActionArgs = {
  draggedColorIndex: number | null;
  editorPalette: EditorPaletteSettings;
  paletteKey: EditorSettingsPaletteKey;
  setDraggedColorIndex: (value: number | null) => void;
  setDragOverColorIndex: (value: number | null) => void;
};

function showErrorToast() {
  toast.error(translate('common.states.error'));
}

function createPresetMutationActions(args: PresetActionArgs) {
  return {
    handleDeletePreset: async (presetId: string) => {
      try {
        if (args.presetOwner === 'rectangle') {
          await deleteBorderPreset(presetId);
          return;
        }

        await deleteEditorPreset(args.presetOwner, presetId);
      } catch {
        showErrorToast();
      }
    },
    handleMakeDefaultPreset: async (presetId: string) => {
      try {
        if (args.presetOwner === 'rectangle') {
          await setDefaultBorderPreset(presetId);
          return;
        }

        await setDefaultEditorPreset(args.presetOwner, presetId);
      } catch {
        showErrorToast();
      }
    },
    handleTogglePresetEnabled: async (presetId: string, enabled: boolean) => {
      try {
        if (args.presetOwner === 'rectangle') {
          await setBorderPresetEnabled(presetId, enabled);
          return;
        }

        await setEditorPresetEnabled(args.presetOwner, presetId, enabled);
      } catch {
        showErrorToast();
      }
    },
  };
}

function createPresetDragActions(args: PresetActionArgs) {
  return {
    handlePresetDragEnd: () => {
      args.setDraggedPresetId(null);
      args.setDragOverPresetId(null);
    },
    handlePresetDragOver: (presetId: string) => {
      if (args.draggedPresetId && args.draggedPresetId !== presetId) {
        args.setDragOverPresetId(presetId);
      }
    },
    handlePresetDragStart: (presetId: string) => {
      args.setDraggedPresetId(presetId);
    },
    handlePresetDrop: async (targetId: string) => {
      const orderedIds = reorderItemIds(args.currentPresets, args.draggedPresetId ?? '', targetId);
      args.setDraggedPresetId(null);
      args.setDragOverPresetId(null);
      if (!orderedIds) {
        return;
      }

      try {
        if (args.presetOwner === 'rectangle') {
          await updateBorderPresetsOrder(orderedIds);
          return;
        }

        await updateEditorPresetOrder(args.presetOwner, orderedIds);
      } catch {
        showErrorToast();
      }
    },
  };
}

function createPaletteMutationActions(args: PaletteActionArgs) {
  return {
    handlePaletteColorChange: async (index: number, color: string) => {
      const nextPalette = {
        ...args.editorPalette,
        [args.paletteKey]: args.editorPalette[args.paletteKey].map((item, itemIndex) =>
          itemIndex === index ? color : item
        ),
      } satisfies EditorPaletteSettings;

      try {
        await saveEditorPaletteSettings(nextPalette);
      } catch {
        showErrorToast();
      }
    },
  };
}

function createPaletteDragActions(args: PaletteActionArgs) {
  return {
    handlePaletteDragEnd: () => {
      args.setDraggedColorIndex(null);
      args.setDragOverColorIndex(null);
    },
    handlePaletteDragOver: (index: number) => {
      if (args.draggedColorIndex !== null && args.draggedColorIndex !== index) {
        args.setDragOverColorIndex(index);
      }
    },
    handlePaletteDragStart: (index: number) => {
      args.setDraggedColorIndex(index);
    },
    handlePaletteDrop: async (targetIndex: number) => {
      const nextPalette = updatePaletteOrder({
        draggedIndex: args.draggedColorIndex,
        palette: args.editorPalette,
        paletteKey: args.paletteKey,
        targetIndex,
      });
      args.setDraggedColorIndex(null);
      args.setDragOverColorIndex(null);
      if (!nextPalette) {
        return;
      }

      try {
        await saveEditorPaletteSettings(nextPalette);
      } catch {
        showErrorToast();
      }
    },
  };
}

export function createPresetActions(args: PresetActionArgs) {
  return {
    ...createPresetMutationActions(args),
    ...createPresetDragActions(args),
  };
}

export function createPaletteActions(args: PaletteActionArgs) {
  return {
    ...createPaletteMutationActions(args),
    ...createPaletteDragActions(args),
  };
}
