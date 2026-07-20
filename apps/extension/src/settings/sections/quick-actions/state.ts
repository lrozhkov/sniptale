import { useState } from 'react';

import type { QuickAction, QuickActionsDisplayMode } from '../../../contracts/settings';
import { DEFAULT_QUICK_ACTIONS_DISPLAY_MODE } from '../../../features/quick-actions-presets/display-mode';

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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QuickAction | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [displayMode, setDisplayModeState] = useState<QuickActionsDisplayMode>(
    DEFAULT_QUICK_ACTIONS_DISPLAY_MODE
  );
  const [isLoading, setIsLoading] = useState(true);

  return {
    confirmDelete,
    displayMode,
    draggedId,
    dragOverId,
    hoveredId,
    isLoading,
    setConfirmDelete,
    setDisplayModeState,
    setDraggedId,
    setDragOverId,
    setHoveredId,
    setIsLoading,
  };
}
