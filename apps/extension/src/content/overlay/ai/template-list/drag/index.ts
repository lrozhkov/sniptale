import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createTemplateDragEndHandler } from './end';
import { createTemplateDragMoveHandler } from './move';
import { createTemplatePointerDownHandler } from './pointer-down';
import type { TemplateDragLifecycleProps, TemplateDragState } from './types';

function useTemplateDragRef() {
  return useRef<TemplateDragState | null>(null);
}

function useTemplateDragLifecycle(props: TemplateDragLifecycleProps) {
  const { dragState, findIdUnderPoint, setDraggedId, setDragOverId, setOrderedIds } = props;

  useEffect(() => {
    const handleMouseMove = createTemplateDragMoveHandler({
      dragState,
      findIdUnderPoint,
      setDraggedId,
      setDragOverId,
    });
    const handleMouseUp = createTemplateDragEndHandler({
      dragState,
      findIdUnderPoint,
      setDraggedId,
      setDragOverId,
      setOrderedIds,
    });

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, findIdUnderPoint, setDraggedId, setDragOverId, setOrderedIds]);
}

export function useTemplateDragState(
  findIdUnderPoint: (x: number, y: number) => string | null,
  setOrderedIds: React.Dispatch<React.SetStateAction<string[]>>
) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragState = useTemplateDragRef();

  useTemplateDragLifecycle({
    dragState,
    findIdUnderPoint,
    setDraggedId,
    setDragOverId,
    setOrderedIds,
  });

  return {
    dragOverId,
    draggedId,
    dragState,
    handlePointerDown: createTemplatePointerDownHandler(dragState),
  };
}
