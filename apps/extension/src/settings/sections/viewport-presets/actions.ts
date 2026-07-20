import { translate } from '../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { ViewportPreset } from '../../../contracts/settings';
import { createViewportPreset, updateViewportPreset } from './helpers';
import type { useViewportPresetsDialogs } from './dialogs';
import type { useViewportPresetsSync } from './sync';

function createDefaultViewportChangeHandler(sync: ReturnType<typeof useViewportPresetsSync>) {
  return async (newId: string) => {
    const previousId = sync.defaultViewportId;
    sync.setDefaultViewportId(newId);
    try {
      await sync.updateSettings({ defaultViewportId: newId });
      toast.success(translate('viewportPresets.messages.defaultUpdated'));
    } catch (error) {
      sync.setDefaultViewportId(previousId);
      throw error;
    }
  };
}

function createViewportPresetSaveHandler(
  sync: ReturnType<typeof useViewportPresetsSync>,
  dialogs: ReturnType<typeof useViewportPresetsDialogs>
) {
  return async (label: string, width: number, height: number) => {
    const previousPresets = sync.viewportPresets;
    const nextPresets = dialogs.editingViewport
      ? updateViewportPreset(sync.viewportPresets, dialogs.editingViewport, label, width, height)
      : [...sync.viewportPresets, createViewportPreset(label, width, height)];

    sync.setViewportPresets(nextPresets);
    try {
      await sync.updateSettings({ viewportPresets: nextPresets });
    } catch (error) {
      sync.setViewportPresets(previousPresets);
      throw error;
    }
    dialogs.setIsViewportEditorOpen(false);

    toast.success(
      translate(
        dialogs.editingViewport
          ? 'viewportPresets.messages.presetUpdated'
          : 'viewportPresets.messages.presetCreated'
      )
    );
  };
}

function createViewportDeleteConfirmHandler(
  sync: ReturnType<typeof useViewportPresetsSync>,
  dialogs: ReturnType<typeof useViewportPresetsDialogs>
) {
  return async () => {
    if (!dialogs.viewportToDelete) {
      return;
    }

    const deletedPresetId = dialogs.viewportToDelete.id;
    const previousPresets = sync.viewportPresets;
    const previousDefaultViewportId = sync.defaultViewportId;
    const nextPresets = sync.viewportPresets.filter((preset) => preset.id !== deletedPresetId);
    const nextDefaultViewportId =
      sync.defaultViewportId === deletedPresetId ? 'native' : sync.defaultViewportId;

    sync.setViewportPresets(nextPresets);
    sync.setDefaultViewportId(nextDefaultViewportId);
    try {
      await sync.updateSettings({
        defaultViewportId: nextDefaultViewportId,
        viewportPresets: nextPresets,
      });
    } catch (error) {
      sync.setDefaultViewportId(previousDefaultViewportId);
      sync.setViewportPresets(previousPresets);
      throw error;
    }
    toast.success(translate('viewportPresets.messages.presetDeleted'));
    dialogs.setViewportConfirmOpen(false);
    dialogs.setViewportToDelete(null);
  };
}

export function useViewportPresetActions(
  sync: ReturnType<typeof useViewportPresetsSync>,
  dialogs: ReturnType<typeof useViewportPresetsDialogs>
) {
  const handleDefaultViewportChange = createDefaultViewportChangeHandler(sync);

  return {
    confirmDeleteViewport: createViewportDeleteConfirmHandler(sync, dialogs),
    handleAddViewportPreset: () => {
      dialogs.setEditingViewport(undefined);
      dialogs.setIsViewportEditorOpen(true);
    },
    handleDefaultViewportChange,
    handleDeleteViewportPreset: (preset: ViewportPreset) => {
      dialogs.setViewportToDelete(preset);
      dialogs.setViewportConfirmOpen(true);
    },
    handleEditViewportPreset: (preset: ViewportPreset) => {
      dialogs.setEditingViewport(preset);
      dialogs.setIsViewportEditorOpen(true);
    },
    handleSaveViewportPreset: createViewportPresetSaveHandler(sync, dialogs),
  };
}
