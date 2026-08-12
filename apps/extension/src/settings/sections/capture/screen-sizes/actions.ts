import { translate } from '../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import type { ViewportPreset } from '../../../../contracts/settings';
import {
  normalizeViewportPresetOrder,
  resetSystemViewportPreset,
} from '../../../../features/viewport-presets/operations';
import {
  createViewportPreset,
  moveViewportPresetBefore,
  updateViewportPreset,
  type ViewportPresetDraft,
} from './helpers';
import type { useViewportPresetsDialogs } from './dialogs';
import type { useViewportPresetsSync } from './sync';

async function commitPresets(
  sync: ReturnType<typeof useViewportPresetsSync>,
  nextPresets: ViewportPreset[]
) {
  const previousPresets = sync.viewportPresets;
  sync.setViewportPresets(nextPresets);
  try {
    await sync.updateSettings({ viewportPresets: nextPresets });
  } catch (error) {
    sync.setViewportPresets(previousPresets);
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
      await commitPresets(sync, nextPresets);
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
    handleDeleteViewportPreset: (preset: ViewportPreset) => {
      if (preset.kind === 'system') return;
      dialogs.setViewportToDelete(preset);
      dialogs.setViewportConfirmOpen(true);
    },
    handleEditViewportPreset: (preset: ViewportPreset) => {
      dialogs.setEditingViewport(preset);
      dialogs.setIsViewportEditorOpen(true);
    },
    handleMoveViewportPresetBefore: async (presetId: string, beforePresetId: string | null) => {
      await runMutation(sync, () =>
        commitPresets(
          sync,
          moveViewportPresetBefore(sync.viewportPresets, presetId, beforePresetId)
        )
      );
    },
    handleResetViewportPreset: async (preset: ViewportPreset) => {
      if (preset.kind !== 'system') return;
      await runMutation(sync, async () => {
        await commitPresets(sync, resetSystemViewportPreset(sync.viewportPresets, preset));
      });
    },
    handleSaveViewportPreset: createViewportPresetSaveHandler(sync, dialogs),
    handleToggleViewportPreset: async (preset: ViewportPreset) => {
      await runMutation(sync, async () => {
        const enabled = !preset.enabled;
        await commitPresets(
          sync,
          normalizeViewportPresetOrder(
            sync.viewportPresets.map((item) =>
              item.id === preset.id ? { ...item, enabled } : { ...item }
            )
          )
        );
      });
    },
  };
}
