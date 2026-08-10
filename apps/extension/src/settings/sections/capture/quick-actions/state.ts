import { useState } from 'react';

import type { QuickAction } from '../../../../contracts/settings';

export function useQuickActionsEditorState() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<QuickAction | null>(null);

  return {
    editForm,
    editingId,
    resetEditor: () => {
      setEditingId(null);
      setEditForm(null);
    },
    setEditForm,
    setEditingId,
  };
}

export function useQuickActionsUiState() {
  const [confirmDelete, setConfirmDelete] = useState<QuickAction | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  return {
    confirmDelete,
    isLoading,
    setConfirmDelete,
    setIsLoading,
  };
}
