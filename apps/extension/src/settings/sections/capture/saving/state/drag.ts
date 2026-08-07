import { useState } from 'react';

export function useSavePresetDragState() {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);

  return {
    draggedId,
    dragOverId,
    hoveredPresetId,
    setDraggedId,
    setDragOverId,
    setHoveredPresetId,
  };
}
