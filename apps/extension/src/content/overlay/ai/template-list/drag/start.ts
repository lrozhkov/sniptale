import type React from 'react';
import type { TemplateDragRef } from './types';

export function startTemplateDragIfNeeded(props: {
  dragState: TemplateDragRef;
  event: MouseEvent;
  setDraggedId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  if (!props.dragState.current) {
    return false;
  }

  const dx = Math.abs(props.event.clientX - props.dragState.current.startX);
  const dy = Math.abs(props.event.clientY - props.dragState.current.startY);

  if (!props.dragState.current.moved && (dx > 4 || dy > 4)) {
    props.dragState.current.moved = true;
    props.setDraggedId(props.dragState.current.id);
  }

  return props.dragState.current.moved;
}
