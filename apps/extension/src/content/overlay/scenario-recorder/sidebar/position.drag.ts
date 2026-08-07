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
  uiScale?: number;
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
            x: event.clientX / (args.uiScale ?? 1) - dragOffsetRef.current.x,
            y: event.clientY / (args.uiScale ?? 1) - dragOffsetRef.current.y,
          },
          sidebarRef.current,
          args.uiScale
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
  }, [args.uiScale, dragOffsetRef, isDragging, setIsDragging, setRequestedPosition, sidebarRef]);
}

export function useSidebarHeaderMouseDown(args: {
  dragOffsetRef: MutableRefObject<ScenarioRecorderSidebarPosition>;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  sidebarRef: RefObject<HTMLElement | null>;
  uiScale?: number;
}) {
  const { dragOffsetRef, setIsDragging, sidebarRef } = args;

  return useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!sidebarRef.current) {
        return;
      }

      const sidebarRect = sidebarRef.current.getBoundingClientRect();
      const uiScale = args.uiScale ?? 1;
      dragOffsetRef.current = {
        x: event.clientX / uiScale - sidebarRect.left / uiScale,
        y: event.clientY / uiScale - sidebarRect.top / uiScale,
      };
      setIsDragging(true);
      event.preventDefault();
    },
    [args.uiScale, dragOffsetRef, setIsDragging, sidebarRef]
  );
}
