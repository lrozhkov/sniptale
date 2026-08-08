import { getDeleteMessage, getViewportPresetCountLabel } from './helpers';
import { useViewportPresetActions } from './actions';
import { useViewportPresetsDialogs } from './dialogs';
import { useViewportPresetsSync } from './sync';

export function useViewportPresetsSection() {
  const sync = useViewportPresetsSync();
  const dialogs = useViewportPresetsDialogs();
  const actions = useViewportPresetActions(sync, dialogs);

  const closeViewportEditor = () => {
    dialogs.setIsViewportEditorOpen(false);
  };

  const closeViewportDeleteDialog = () => {
    dialogs.setViewportConfirmOpen(false);
    dialogs.setViewportToDelete(null);
  };

  return {
    defaultField: {
      onChange: actions.handleDefaultViewportChange,
      selectedPresetId: sync.defaultViewportPresetId,
    },
    deletion: {
      close: closeViewportDeleteDialog,
      confirm: actions.confirmDeleteViewport,
      isOpen: dialogs.viewportConfirmOpen,
      message: getDeleteMessage(dialogs.viewportToDelete ?? undefined),
    },
    editor: {
      close: closeViewportEditor,
      isOpen: dialogs.isViewportEditorOpen,
      onAdd: actions.handleAddViewportPreset,
      onSave: actions.handleSaveViewportPreset,
      ...(dialogs.editingViewport === undefined ? {} : { editingPreset: dialogs.editingViewport }),
    },
    list: {
      countLabel: getViewportPresetCountLabel(sync.viewportPresets.length),
      onDelete: actions.handleDeleteViewportPreset,
      onEdit: actions.handleEditViewportPreset,
      onMoveBefore: actions.handleMoveViewportPresetBefore,
      onReset: actions.handleResetViewportPreset,
      onToggle: actions.handleToggleViewportPreset,
      onSetDefault: actions.handleDefaultViewportChange,
    },
    model: {
      isLoading: sync.isLoading,
      presets: sync.viewportPresets,
    },
  };
}
