import type React from 'react';
import type { TemplateDragRef } from './types';

export function updateTemplateDragOver(props: {
  dragState: TemplateDragRef;
  event: MouseEvent;
  findIdUnderPoint: (x: number, y: number) => string | null;
  setDragOverId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const draggedId = props.dragState.current?.id;
  if (!draggedId) {
    return;
  }

  const overId = props.findIdUnderPoint(props.event.clientX, props.event.clientY);
  props.setDragOverId(overId !== draggedId ? overId : null);
}
