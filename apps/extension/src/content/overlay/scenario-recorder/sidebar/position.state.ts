import { useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { ScenarioRecorderSidebarPosition } from './position.helpers';

const DEFAULT_SIDEBAR_TOP = 96;
const SIDEBAR_INITIAL_X = 12;

type ScenarioRecorderSidebarPositionState = {
  dragOffsetRef: MutableRefObject<ScenarioRecorderSidebarPosition>;
  initializedRef: MutableRefObject<boolean>;
  isDragging: boolean;
  requestedPosition: ScenarioRecorderSidebarPosition;
  resolvedPosition: ScenarioRecorderSidebarPosition;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  setRequestedPosition: Dispatch<SetStateAction<ScenarioRecorderSidebarPosition>>;
  setResolvedPosition: Dispatch<SetStateAction<ScenarioRecorderSidebarPosition>>;
  sidebarRef: RefObject<HTMLElement | null>;
};

export { DEFAULT_SIDEBAR_TOP };

export function useSidebarPositionState(): ScenarioRecorderSidebarPositionState {
  const sidebarRef = useRef<HTMLElement>(null);
  const dragOffsetRef = useRef<ScenarioRecorderSidebarPosition>({ x: 0, y: 0 });
  const initializedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [requestedPosition, setRequestedPosition] = useState<ScenarioRecorderSidebarPosition>({
    x: SIDEBAR_INITIAL_X,
    y: DEFAULT_SIDEBAR_TOP,
  });
  const [resolvedPosition, setResolvedPosition] = useState<ScenarioRecorderSidebarPosition>({
    x: SIDEBAR_INITIAL_X,
    y: DEFAULT_SIDEBAR_TOP,
  });

  return {
    dragOffsetRef,
    initializedRef,
    isDragging,
    requestedPosition,
    resolvedPosition,
    setIsDragging,
    setRequestedPosition,
    setResolvedPosition,
    sidebarRef,
  };
}
