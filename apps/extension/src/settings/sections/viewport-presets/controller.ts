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
    defaultViewportId: sync.defaultViewportId,
    deleteMessage: getDeleteMessage(dialogs.viewportToDelete?.label),
    editingViewport: dialogs.editingViewport,
    handleAddViewportPreset: actions.handleAddViewportPreset,
    handleDefaultViewportChange: actions.handleDefaultViewportChange,
    handleDeleteViewportPreset: actions.handleDeleteViewportPreset,
    handleEditViewportPreset: actions.handleEditViewportPreset,
    handleSaveViewportPreset: actions.handleSaveViewportPreset,
    hoveredViewportId: dialogs.hoveredViewportId,
    isLoading: sync.isLoading,
    isViewportEditorOpen: dialogs.isViewportEditorOpen,
    presetsCountLabel: getViewportPresetCountLabel(sync.viewportPresets.length),
    setHoveredViewportId: dialogs.setHoveredViewportId,
    viewportConfirmOpen: dialogs.viewportConfirmOpen,
    viewportPresets: sync.viewportPresets,
    closeViewportDeleteDialog,
    closeViewportEditor,
    confirmDeleteViewport: actions.confirmDeleteViewport,
  };
}
