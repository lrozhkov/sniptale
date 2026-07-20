import type React from 'react';
import { startTemplateDragIfNeeded } from './start';
import { updateTemplateDragOver } from './over';
import type { TemplateDragRef } from './types';

export function createTemplateDragMoveHandler(props: {
  dragState: TemplateDragRef;
  findIdUnderPoint: (x: number, y: number) => string | null;
  setDraggedId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  return (event: MouseEvent) => {
    const didStartDragging = startTemplateDragIfNeeded({
      dragState: props.dragState,
      event,
      setDraggedId: props.setDraggedId,
    });
    if (!didStartDragging) {
      return;
    }

    updateTemplateDragOver({
      dragState: props.dragState,
      event,
      findIdUnderPoint: props.findIdUnderPoint,
      setDragOverId: props.setDragOverId,
    });
  };
}
