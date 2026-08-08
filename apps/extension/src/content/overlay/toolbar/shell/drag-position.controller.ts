import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { ContentToolbarPosition } from '../../../../contracts/settings';

export function useToolbarDragController(
  position: ContentToolbarPosition,
  uiScale = 1
): {
  dragOffset: RefObject<ContentToolbarPosition>;
  handleMouseDown: (event: {
    clientX: number;
    clientY: number;
    preventDefault: () => void;
  }) => void;
  isDragging: boolean;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  toolbarRef: RefObject<HTMLDivElement | null>;
} {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<ContentToolbarPosition>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const handleMouseDown = useCallback(
    (event: { clientX: number; clientY: number; preventDefault: () => void }) => {
      setIsDragging(true);
      dragOffset.current = {
        x: event.clientX / uiScale - position.x,
        y: event.clientY / uiScale - position.y,
      };
      event.preventDefault();
    },
    [position.x, position.y, uiScale]
  );

  return {
    dragOffset,
    handleMouseDown,
    isDragging,
    setIsDragging,
    toolbarRef,
  };
}
