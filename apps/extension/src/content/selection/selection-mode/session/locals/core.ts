import type { SelectionModeSession } from './contract';
import {
  createSelectionModeSessionCallbackSetters,
  createSelectionModeSessionInteractionStateSetters,
  createSelectionModeSessionStateDomSetters,
} from './setter-groups';

export function createSelectionModeSessionLocalSetters(session: SelectionModeSession) {
  return {
    ...createSelectionModeSessionCoreSetters(session),
    ...createSelectionModeSessionInteractionStateSetters(session),
    setMaintainAspectRatio: (value: boolean) => {
      session.maintainAspectRatio = value;
    },
    setSkipNextClick: (value: boolean) => {
      session.skipNextClick = value;
    },
  };
}

function createSelectionModeSessionCoreSetters(session: SelectionModeSession) {
  return {
    setAspectRatio: (value: number | null) => {
      session.aspectRatio = value;
    },
    ...createSelectionModeSessionCallbackSetters(session),
    setCurrentSelection: (value: SelectionModeSession['currentSelection']) => {
      session.currentSelection = value;
    },
    ...createSelectionModeSessionStateDomSetters(session),
    setDragStartPoint: (value: SelectionModeSession['dragStartPoint']) => {
      session.dragStartPoint = value;
    },
    setDragThreshold: (value: number) => {
      session.dragThreshold = value;
    },
    setMouseDownPoint: (value: SelectionModeSession['mouseDownPoint']) => {
      session.mouseDownPoint = value;
    },
    setRejectCallback: (value: SelectionModeSession['rejectCallback']) => {
      session.rejectCallback = value;
    },
    setResolveCallback: (value: SelectionModeSession['resolveCallback']) => {
      session.resolveCallback = value;
    },
    setSelectionAtDragStart: (value: SelectionModeSession['selectionAtDragStart']) => {
      session.selectionAtDragStart = value;
    },
  };
}
