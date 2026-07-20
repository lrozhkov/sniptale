import { useState } from 'react';

import type { ViewportPreset } from '../../../contracts/settings';

export function useViewportPresetsDialogs() {
  const [hoveredViewportId, setHoveredViewportId] = useState<string | null>(null);
  const [isViewportEditorOpen, setIsViewportEditorOpen] = useState(false);
  const [editingViewport, setEditingViewport] = useState<ViewportPreset | undefined>(undefined);
  const [viewportConfirmOpen, setViewportConfirmOpen] = useState(false);
  const [viewportToDelete, setViewportToDelete] = useState<ViewportPreset | null>(null);

  return {
    editingViewport,
    hoveredViewportId,
    isViewportEditorOpen,
    setEditingViewport,
    setHoveredViewportId,
    setIsViewportEditorOpen,
    setViewportConfirmOpen,
    setViewportToDelete,
    viewportConfirmOpen,
    viewportToDelete,
  };
}
