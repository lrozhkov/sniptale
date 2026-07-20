import type React from 'react';

export function cleanupTemplateDragState(props: {
  setDraggedId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverId: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  props.setDraggedId(null);
  props.setDragOverId(null);
}
