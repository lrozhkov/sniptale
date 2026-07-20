import type React from 'react';

export type TemplateDragState = {
  id: string;
  moved: boolean;
  startX: number;
  startY: number;
};

export type TemplateDragRef = React.MutableRefObject<TemplateDragState | null>;

export type TemplateDragLifecycleProps = {
  dragState: TemplateDragRef;
  findIdUnderPoint: (x: number, y: number) => string | null;
  setDraggedId: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverId: React.Dispatch<React.SetStateAction<string | null>>;
  setOrderedIds: React.Dispatch<React.SetStateAction<string[]>>;
};
