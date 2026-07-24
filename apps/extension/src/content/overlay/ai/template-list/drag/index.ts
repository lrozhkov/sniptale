import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getContentEventTargetElement } from '../../../../platform/dom-host';
import { findTemplateIdUnderPoint } from './targets';

type TemplateDragState = {
  id: string;
  moved: boolean;
  startX: number;
  startY: number;
};

type TemplateDragRef = React.MutableRefObject<TemplateDragState | null>;

type TemplateDragViewState = {
  draggedId: string | null;
  dragOverId: string | null;
};

type TemplateDragLifecycleProps = {
  dragState: TemplateDragRef;
  findIdUnderPoint: (x: number, y: number) => string | null;
  onDrop: (sourceId: string, targetId: string) => void;
  setViewState: React.Dispatch<React.SetStateAction<TemplateDragViewState>>;
};

type TemplateDragMoveProps = Omit<TemplateDragLifecycleProps, 'onDrop'>;

function startTemplateDragIfNeeded(
  dragState: TemplateDragRef,
  event: MouseEvent,
  setViewState: React.Dispatch<React.SetStateAction<TemplateDragViewState>>
) {
  if (!dragState.current) {
    return false;
  }

  const dx = Math.abs(event.clientX - dragState.current.startX);
  const dy = Math.abs(event.clientY - dragState.current.startY);

  if (!dragState.current.moved && (dx > 4 || dy > 4)) {
    dragState.current.moved = true;
    const draggedId = dragState.current.id;
    setViewState((current) => ({ ...current, draggedId }));
  }

  return dragState.current.moved;
}

function createTemplateDragMoveHandler(props: TemplateDragMoveProps) {
  return (event: MouseEvent) => {
    if (!startTemplateDragIfNeeded(props.dragState, event, props.setViewState)) {
      return;
    }

    const draggedId = props.dragState.current?.id;
    if (!draggedId) {
      return;
    }

    const overId = props.findIdUnderPoint(event.clientX, event.clientY);
    const dragOverId = overId !== draggedId ? overId : null;
    props.setViewState((current) => ({ ...current, dragOverId }));
  };
}

function createTemplateDragEndHandler(props: TemplateDragLifecycleProps) {
  return (event: MouseEvent) => {
    if (!props.dragState.current) {
      return;
    }

    const { id, moved } = props.dragState.current;
    props.dragState.current = null;

    if (!moved) {
      return;
    }

    const overId = props.findIdUnderPoint(event.clientX, event.clientY);
    if (overId && overId !== id) {
      props.onDrop(id, overId);
    }

    props.setViewState({ draggedId: null, dragOverId: null });
  };
}

function createTemplatePointerDownHandler(dragState: TemplateDragRef) {
  return (event: React.MouseEvent, id: string) => {
    if (event.button !== 0) {
      return;
    }

    if (getContentEventTargetElement(event.nativeEvent)?.closest('[data-menu-btn]')) {
      return;
    }

    dragState.current = { id, startX: event.clientX, startY: event.clientY, moved: false };
  };
}

function useTemplateDragRef() {
  return useRef<TemplateDragState | null>(null);
}

function useTemplateDragLifecycle(props: TemplateDragLifecycleProps) {
  const { dragState, findIdUnderPoint, onDrop, setViewState } = props;

  useEffect(() => {
    const handleMouseMove = createTemplateDragMoveHandler({
      dragState,
      findIdUnderPoint,
      setViewState,
    });
    const handleMouseUp = createTemplateDragEndHandler({
      dragState,
      findIdUnderPoint,
      onDrop,
      setViewState,
    });

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, findIdUnderPoint, onDrop, setViewState]);
}

export function useTemplateDragState(
  pillRefs: React.RefObject<Map<string, HTMLDivElement>>,
  onDrop: (sourceId: string, targetId: string) => void
) {
  const [viewState, setViewState] = useState<TemplateDragViewState>({
    draggedId: null,
    dragOverId: null,
  });
  const dragState = useTemplateDragRef();
  const findIdUnderPoint = useCallback(
    (x: number, y: number) => findTemplateIdUnderPoint(pillRefs.current, x, y),
    [pillRefs]
  );

  useTemplateDragLifecycle({
    dragState,
    findIdUnderPoint,
    onDrop,
    setViewState,
  });

  return {
    dragOverId: viewState.dragOverId,
    draggedId: viewState.draggedId,
    dragState,
    handlePointerDown: createTemplatePointerDownHandler(dragState),
  };
}
