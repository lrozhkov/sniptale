import type React from 'react';

type LayerDropController = {
  reorderLayer: (draggedLayerId: string, targetLayerId: string) => void;
};

type LayerDragStateSetters = {
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;
};

function clearLayerDragState(args: LayerDragStateSetters) {
  args.setDraggedLayerId(null);
  args.setDragOverLayerId(null);
}

export function createLayerDropHandler(
  args: LayerDragStateSetters & {
    controller: LayerDropController;
    draggedLayerId: string | null;
  }
) {
  return (targetLayerId: string) => {
    if (!args.draggedLayerId || args.draggedLayerId === targetLayerId) {
      clearLayerDragState(args);
      return;
    }

    args.controller.reorderLayer(args.draggedLayerId, targetLayerId);
    clearLayerDragState(args);
  };
}
