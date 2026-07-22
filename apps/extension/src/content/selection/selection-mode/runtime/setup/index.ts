import { getAbsolutePosition } from '../../../../platform/frame';
import type { SelectionModeSession } from '../../session';
import { createSelectionModeHoverFrameHandlers } from '../../ui/hover';

export interface SelectionModeRuntimePointerHandlers {
  handleClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handleMouseDown: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleMouseLeave: () => void;
  handleMouseMove: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleMouseUp: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
}

export interface SelectionModeRuntimeSetupArgs extends SelectionModeRuntimePointerHandlers {
  createDragFrame: () => void;
  createFinalElements: () => void;
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  minSelectionSize: number;
  session: SelectionModeSession;
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
  setCleanupScrollListeners: (cleanup: (() => void) | null) => void;
  updateFinalFrame: () => void;
  zIndexBase: number;
}

export function createSelectionModeRuntimeSetup(args: SelectionModeRuntimeSetupArgs) {
  return {
    ...createSelectionModeHoverFrameHandlers(args.session),
    createDragFrame: args.createDragFrame,
    getAbsolutePosition,
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    minSelectionSize: args.minSelectionSize,
    setCleanupEventListeners: args.setCleanupEventListeners,
    setCleanupScrollListeners: args.setCleanupScrollListeners,
    setupListenerHandlers: createListenerHandlers(args),
    showFinalFrame: () => {
      args.createFinalElements();
      args.session.currentState = 'confirmed';
      args.updateFinalFrame();
    },
    state: args.session,
    updateFinalFrame: args.updateFinalFrame,
    zIndexBase: args.zIndexBase,
  };
}

function createListenerHandlers(args: SelectionModeRuntimePointerHandlers) {
  return {
    handleClick: args.handleClick,
    handleKeyDown: args.handleKeyDown,
    handleMouseDown: args.handleMouseDown,
    handleMouseLeave: args.handleMouseLeave,
    handleMouseMove: args.handleMouseMove,
    handleMouseUp: args.handleMouseUp,
  };
}
