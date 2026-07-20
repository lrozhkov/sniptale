import type { SelectionModeInteractionState } from '../types';

type SelectionModeEventHandlersDeps = {
  cancelSelection: () => void;
  confirmSelection: () => void;
  handleDragMove: (event: MouseEvent) => void;
  handleResizeMove: (event: MouseEvent) => void;
  hideHoverFrame: () => void;
  isExtensionUIElement: (target: HTMLElement) => boolean;
  selectElement: (element: HTMLElement, iframe?: HTMLIFrameElement) => void;
  showHoverFrame: (element: HTMLElement, iframe?: HTMLIFrameElement) => void;
  startDragSelection: (startX: number, startY: number) => void;
  updateDragSelection: (currentX: number, currentY: number) => void;
  finalizeDragSelection: () => void;
  resetToIdleState: () => void;
  updateFinalFrame: () => void;
};

export type SelectionModeEventHandlersArgs = {
  selectionModeEvents: SelectionModeEventHandlersDeps & {
    constrainSelection: () => void;
  };
  state: SelectionModeInteractionState;
};

export type SelectionModeEventHandlersContext = {
  selectionModeEvents: SelectionModeEventHandlersDeps;
  state: SelectionModeInteractionState;
  withStateSync: (callback: () => void) => void;
};
