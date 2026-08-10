import { useState } from 'react';

import type { QuickAction } from '../../../../contracts/settings';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { createQuickActionsCrud } from './crud';
import { createQuickActionsOrdering } from './ordering';
import { useQuickActionsLoader } from './loader';
import { useQuickActionsEditorState, useQuickActionsUiState } from './state';

type QuickActionsControllerModelParams = {
  actions: QuickAction[];
  crud: ReturnType<typeof createQuickActionsCrud>;
  ordering: ReturnType<typeof createQuickActionsOrdering>;
  editorState: ReturnType<typeof useQuickActionsEditorState>;
  uiState: ReturnType<typeof useQuickActionsUiState>;
};

function createQuickActionsControllerModel(params: QuickActionsControllerModelParams) {
  return {
    actions: params.actions,
    confirmDelete: params.uiState.confirmDelete,
    editForm: params.editorState.editForm,
    editingId: params.editorState.editingId,
    isLoading: params.uiState.isLoading,
    setConfirmDelete: params.uiState.setConfirmDelete,
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

  useQuickActionsLoader({
    setActions,
    setIsLoading: uiState.setIsLoading,
  });

  const crud = createQuickActionsCrud({
    actions,
    editForm: editorState.editForm,
    resetEditor: editorState.resetEditor,
    setActions,
    setEditingId: editorState.setEditingId,
    setEditForm: editorState.setEditForm,
  });

  const ordering = createQuickActionsOrdering({
    actions,
    setActions,
  });

  return createQuickActionsControllerModel({
    actions,
    crud,
    ordering,
    editorState,
    uiState,
  });
}

export type QuickActionsSectionState = ReturnType<typeof useQuickActionsController>;
