import type React from 'react';
import { reorderTemplateIds } from '../state/helpers';

export function reorderTemplatesOnDrop(props: {
  draggedId: string;
  event: MouseEvent;
  findIdUnderPoint: (x: number, y: number) => string | null;
  setOrderedIds: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const overId = props.findIdUnderPoint(props.event.clientX, props.event.clientY);
  if (!overId || overId === props.draggedId) {
    return;
  }

  props.setOrderedIds((previous) => reorderTemplateIds(previous, props.draggedId, overId));
}
