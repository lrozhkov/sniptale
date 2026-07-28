import { translate } from '../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { ViewportPreset } from '../../../contracts/settings';
import {
  normalizeViewportPresetOrder,
  resetSystemViewportPreset,
} from '../../../features/viewport-presets/operations';
import {
  createViewportPreset,
  moveViewportPreset,
  updateViewportPreset,
  type ViewportPresetDraft,
} from './helpers';
import type { useViewportPresetsDialogs } from './dialogs';
import type { useViewportPresetsSync } from './sync';

async function commitPresets(
  sync: ReturnType<typeof useViewportPresetsSync>,
  nextPresets: ViewportPreset[],
  nextDefaultId: string | null = sync.defaultViewportPresetId
) {
  const previousPresets = sync.viewportPresets;
  const previousDefaultId = sync.defaultViewportPresetId;
  sync.setViewportPresets(nextPresets);
  sync.setDefaultViewportPresetId(nextDefaultId);
  try {
    await sync.updateSettings({
      viewportPresets: nextPresets,
      defaultViewportPresetId: nextDefaultId,
    });
  } catch (error) {
    sync.setViewportPresets(previousPresets);
    sync.setDefaultViewportPresetId(previousDefaultId);
    throw error;
  }
}

async function runMutation<T>(
  sync: ReturnType<typeof useViewportPresetsSync>,
  mutate: () => Promise<T>,
  options: { rethrow?: boolean } = {}
): Promise<T | undefined> {
  if (!sync.beginMutation()) return undefined;
  try {
    return await mutate();
  } catch (error) {
    toast.error(translate('viewportPresets.messages.updateFailed'));
    if (options.rethrow) throw error;
    return undefined;
  } finally {
    sync.endMutation();
  }
}

function createDefaultViewportChangeHandler(sync: ReturnType<typeof useViewportPresetsSync>) {
  return async (newId: string | null) => {
    await runMutation(sync, async () => {
      const previousId = sync.defaultViewportPresetId;
      sync.setDefaultViewportPresetId(newId);
      try {
        await sync.updateSettings({ defaultViewportPresetId: newId });
        toast.success(translate('viewportPresets.messages.defaultUpdated'));
      } catch (error) {
        sync.setDefaultViewportPresetId(previousId);
        throw error;
      }
    });
  };
}

function createViewportPresetSaveHandler(
  sync: ReturnType<typeof useViewportPresetsSync>,
  dialogs: ReturnType<typeof useViewportPresetsDialogs>
) {
  return async (draft: ViewportPresetDraft) => {
    await runMutation(
      sync,
      async () => {
        const nextPresets = normalizeViewportPresetOrder(
          dialogs.editingViewport
            ? updateViewportPreset(sync.viewportPresets, dialogs.editingViewport, draft)
            : [...sync.viewportPresets, createViewportPreset(draft, sync.viewportPresets)]
        );
        await commitPresets(sync, nextPresets);
        dialogs.setIsViewportEditorOpen(false);
        toast.success(
          translate(
            dialogs.editingViewport
              ? 'viewportPresets.messages.presetUpdated'
              : 'viewportPresets.messages.presetCreated'
          )
        );
      },
      { rethrow: true }
    );
  };
}

function createViewportDeleteConfirmHandler(
  sync: ReturnType<typeof useViewportPresetsSync>,
  dialogs: ReturnType<typeof useViewportPresetsDialogs>
) {
  return async () => {
    const preset = dialogs.viewportToDelete;
    if (!preset || preset.kind === 'system') return;
    await runMutation(sync, async () => {
      const nextPresets = sync.viewportPresets.filter((item) => item.id !== preset.id);
      const nextDefaultId =
        sync.defaultViewportPresetId === preset.id ? null : sync.defaultViewportPresetId;
      await commitPresets(sync, nextPresets, nextDefaultId);
      toast.success(translate('viewportPresets.messages.presetDeleted'));
      dialogs.setViewportConfirmOpen(false);
      dialogs.setViewportToDelete(null);
    });
  };
}

export function useViewportPresetActions(
  sync: ReturnType<typeof useViewportPresetsSync>,
  dialogs: ReturnType<typeof useViewportPresetsDialogs>
) {
  return {
    confirmDeleteViewport: createViewportDeleteConfirmHandler(sync, dialogs),
    handleAddViewportPreset: () => {
      dialogs.setEditingViewport(undefined);
      dialogs.setIsViewportEditorOpen(true);
    },
    handleDefaultViewportChange: createDefaultViewportChangeHandler(sync),
    handleDeleteViewportPreset: (preset: ViewportPreset) => {
      if (preset.kind === 'system') return;
      dialogs.setViewportToDelete(preset);
      dialogs.setViewportConfirmOpen(true);
    },
    handleEditViewportPreset: (preset: ViewportPreset) => {
      dialogs.setEditingViewport(preset);
      dialogs.setIsViewportEditorOpen(true);
    },
    handleMoveViewportPreset: async (presetId: string, direction: -1 | 1) => {
      await runMutation(sync, () =>
        commitPresets(sync, moveViewportPreset(sync.viewportPresets, presetId, direction))
      );
    },
    handleResetViewportPreset: async (preset: ViewportPreset) => {
      if (preset.kind !== 'system') return;
      await runMutation(sync, async () => {
        await commitPresets(sync, resetSystemViewportPreset(sync.viewportPresets, preset));
        toast.success(translate('viewportPresets.messages.presetReset'));
      });
    },
    handleSaveViewportPreset: createViewportPresetSaveHandler(sync, dialogs),
    handleToggleViewportPreset: async (preset: ViewportPreset) => {
      await runMutation(sync, async () => {
        const enabled = !preset.enabled;
        const nextDefaultId =
          !enabled && sync.defaultViewportPresetId === preset.id
            ? null
            : sync.defaultViewportPresetId;
        await commitPresets(
          sync,
          normalizeViewportPresetOrder(
            sync.viewportPresets.map((item) =>
              item.id === preset.id ? { ...item, enabled } : { ...item }
            )
          ),
          nextDefaultId
        );
        toast.success(
          translate(
            enabled
              ? 'viewportPresets.messages.presetEnabled'
              : 'viewportPresets.messages.presetDisabled'
          )
        );
      });
    },
  };
}
