import { useState } from 'react';

import type { SavePreset } from '../../../../contracts/settings';

export function useSavePresetDialogs() {
  const [editingPreset, setEditingPreset] = useState<SavePreset | undefined>(undefined);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SavePreset | null>(null);

  return {
    closeDeleteDialog: () => setConfirmDelete(null),
    closeEditor: () => {
      setIsEditorOpen(false);
      setEditingPreset(undefined);
    },
    confirmDelete,
    editingPreset,
    isEditorOpen,
    openEditor: (preset?: SavePreset) => {
      setEditingPreset(preset);
      setIsEditorOpen(true);
    },
    setConfirmDelete,
    setEditingPreset,
    setIsEditorOpen,
  };
}
