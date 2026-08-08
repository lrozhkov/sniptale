import { useState } from 'react';

import type { ViewportPreset } from '../../../../contracts/settings';

export function useViewportPresetsDialogs() {
  const [isViewportEditorOpen, setIsViewportEditorOpen] = useState(false);
  const [editingViewport, setEditingViewport] = useState<ViewportPreset | undefined>(undefined);
  const [viewportConfirmOpen, setViewportConfirmOpen] = useState(false);
  const [viewportToDelete, setViewportToDelete] = useState<ViewportPreset | null>(null);

  return {
    editingViewport,
    isViewportEditorOpen,
    setEditingViewport,
    setIsViewportEditorOpen,
    setViewportConfirmOpen,
    setViewportToDelete,
    viewportConfirmOpen,
    viewportToDelete,
  };
}
