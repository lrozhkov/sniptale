import { useSidebarDragListeners, useSidebarHeaderMouseDown } from './position.drag';
import { useSidebarPositionState } from './position.state';
import {
  useSidebarFloatingObservers,
  useSidebarPositionInitialization,
  useSidebarResolvedPositionSync,
} from './position.sync';
import { useContentUiScale } from '../../../platform/dom-host';
export {
  clampScenarioRecorderSidebarPosition,
  resolveScenarioRecorderSidebarPosition,
  type ScenarioRecorderSidebarPosition,
} from './position.helpers';

export function useScenarioRecorderSidebarPosition(visible: boolean) {
  const sidebarState = useSidebarPositionState();
  const uiScale = useContentUiScale();

  useSidebarPositionInitialization({
    initializedRef: sidebarState.initializedRef,
    setRequestedPosition: sidebarState.setRequestedPosition,
    setResolvedPosition: sidebarState.setResolvedPosition,
    sidebarRef: sidebarState.sidebarRef,
    visible,
    uiScale,
  });
  const { animationFrameRef, scheduleResolvedPositionSync } = useSidebarResolvedPositionSync({
    requestedPosition: sidebarState.requestedPosition,
    setResolvedPosition: sidebarState.setResolvedPosition,
    sidebarRef: sidebarState.sidebarRef,
    visible,
    uiScale,
  });
  useSidebarFloatingObservers({
    animationFrameRef,
    scheduleResolvedPositionSync,
    sidebarRef: sidebarState.sidebarRef,
    visible,
  });
  useSidebarDragListeners({
    dragOffsetRef: sidebarState.dragOffsetRef,
    isDragging: sidebarState.isDragging,
    setIsDragging: sidebarState.setIsDragging,
    setRequestedPosition: sidebarState.setRequestedPosition,
    sidebarRef: sidebarState.sidebarRef,
    uiScale,
  });
  const handleHeaderMouseDown = useSidebarHeaderMouseDown({
    dragOffsetRef: sidebarState.dragOffsetRef,
    setIsDragging: sidebarState.setIsDragging,
    sidebarRef: sidebarState.sidebarRef,
    uiScale,
  });

  return {
    handleHeaderMouseDown,
    isDragging: sidebarState.isDragging,
    position: sidebarState.resolvedPosition,
    sidebarRef: sidebarState.sidebarRef,
    uiScale,
  };
}
