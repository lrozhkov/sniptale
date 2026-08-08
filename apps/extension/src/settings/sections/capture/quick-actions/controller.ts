import { useState } from 'react';

import type { QuickAction, QuickActionsDisplayMode } from '../../../../contracts/settings';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { createQuickActionsCrud } from './crud';
import { persistDisplayMode } from './display-mode';
import { createQuickActionsOrdering } from './ordering';
import { useQuickActionsLoader } from './loader';
import { useQuickActionsEditorState, useQuickActionsUiState } from './state';
import { useSettingsInlineConfirmation } from './inline-confirmation/hook';

type QuickActionsControllerModelParams = {
  actions: QuickAction[];
  confirmationMessage: string | null;
  crud: ReturnType<typeof createQuickActionsCrud>;
  ordering: ReturnType<typeof createQuickActionsOrdering>;
  editorState: ReturnType<typeof useQuickActionsEditorState>;
  showConfirmation: (message: string) => void;
  uiState: ReturnType<typeof useQuickActionsUiState>;
};

function createQuickActionsControllerModel(params: QuickActionsControllerModelParams) {
  return {
    actions: params.actions,
    confirmationMessage: params.confirmationMessage,
    confirmDelete: params.uiState.confirmDelete,
    displayMode: params.uiState.displayMode,
    editForm: params.editorState.editForm,
    editingId: params.editorState.editingId,
    isLoading: params.uiState.isLoading,
    setConfirmDelete: params.uiState.setConfirmDelete,
    setDisplayMode: async (value: QuickActionsDisplayMode) =>
      persistDisplayMode(
        params.uiState.displayMode,
        value,
        params.uiState.setDisplayModeState,
        params.showConfirmation
      ),
    handleHotkeyError: (message: string) => {
      toast.error(message);
    },
    ...params.crud,
    ...params.ordering,
  };
}

export function useQuickActionsController() {
  const [actions, setActions] = useState<QuickAction[]>([]);
  const uiState = useQuickActionsUiState();
  const editorState = useQuickActionsEditorState();
  const { confirmationMessage, showConfirmation } = useSettingsInlineConfirmation();

  useQuickActionsLoader({
    setActions,
    setDisplayModeState: uiState.setDisplayModeState,
    setIsLoading: uiState.setIsLoading,
  });

  const crud = createQuickActionsCrud({
    actions,
    editForm: editorState.editForm,
    resetEditor: editorState.resetEditor,
    setActions,
    setEditingId: editorState.setEditingId,
    setEditForm: editorState.setEditForm,
    showConfirmation,
  });

  const ordering = createQuickActionsOrdering({
    actions,
    setActions,
  });

  return createQuickActionsControllerModel({
    actions,
    confirmationMessage,
    crud,
    ordering,
    editorState,
    showConfirmation,
    uiState,
  });
}

export type QuickActionsSectionState = ReturnType<typeof useQuickActionsController>;
