import { useCallback, useEffect } from 'react';
import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react';
import {
  clampScenarioRecorderSidebarPosition,
  type ScenarioRecorderSidebarPosition,
} from './position.helpers';

const PASSIVE_MOUSE_LISTENER_OPTIONS: AddEventListenerOptions = { passive: true };

export function useSidebarDragListeners(args: {
  dragOffsetRef: MutableRefObject<ScenarioRecorderSidebarPosition>;
  isDragging: boolean;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  setRequestedPosition: Dispatch<SetStateAction<ScenarioRecorderSidebarPosition>>;
  sidebarRef: RefObject<HTMLElement | null>;
}) {
  const { dragOffsetRef, isDragging, setIsDragging, setRequestedPosition, sidebarRef } = args;

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!sidebarRef.current) {
        return;
      }

      setRequestedPosition(
        clampScenarioRecorderSidebarPosition(
          {
            x: event.clientX - dragOffsetRef.current.x,
            y: event.clientY - dragOffsetRef.current.y,
          },
          sidebarRef.current
        )
      );
    };
    const stopDragging = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove, PASSIVE_MOUSE_LISTENER_OPTIONS);
    window.addEventListener('mouseup', stopDragging, PASSIVE_MOUSE_LISTENER_OPTIONS);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, PASSIVE_MOUSE_LISTENER_OPTIONS);
      window.removeEventListener('mouseup', stopDragging, PASSIVE_MOUSE_LISTENER_OPTIONS);
    };
  }, [dragOffsetRef, isDragging, setIsDragging, setRequestedPosition, sidebarRef]);
}

export function useSidebarHeaderMouseDown(args: {
  dragOffsetRef: MutableRefObject<ScenarioRecorderSidebarPosition>;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  sidebarRef: RefObject<HTMLElement | null>;
}) {
  const { dragOffsetRef, setIsDragging, sidebarRef } = args;

  return useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!sidebarRef.current) {
        return;
      }

      const sidebarRect = sidebarRef.current.getBoundingClientRect();
      dragOffsetRef.current = {
        x: event.clientX - sidebarRect.left,
        y: event.clientY - sidebarRect.top,
      };
      setIsDragging(true);
      event.preventDefault();
    },
    [dragOffsetRef, setIsDragging, sidebarRef]
  );
}
