import { cleanupTemplateDragState } from './cleanup';
import { reorderTemplatesOnDrop } from './drop-reorder';
import type { TemplateDragLifecycleProps } from './types';

export function createTemplateDragEndHandler(props: TemplateDragLifecycleProps) {
  return (event: MouseEvent) => {
    if (!props.dragState.current) {
      return;
    }

    const { id, moved } = props.dragState.current;
    props.dragState.current = null;

    if (!moved) {
      return;
    }

    reorderTemplatesOnDrop({
      draggedId: id,
      event,
      findIdUnderPoint: props.findIdUnderPoint,
      setOrderedIds: props.setOrderedIds,
    });
    cleanupTemplateDragState({
      setDraggedId: props.setDraggedId,
      setDragOverId: props.setDragOverId,
    });
  };
}
