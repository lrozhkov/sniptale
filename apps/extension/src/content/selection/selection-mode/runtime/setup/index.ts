import { getAbsolutePosition } from '../../../../platform/frame';
import type { SelectionModeSession } from '../../session';
import { createSelectionModeHoverFrameHandlers } from '../../ui/hover';

export interface SelectionModeRuntimePointerHandlers {
  handleClick: (event: MouseEvent, iframe?: HTMLIFrameElement) => void;
  handleDragStart: (event: DragEvent) => void;
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
  flushFinalFrameUpdate: () => void;
  minSelectionSize: number;
  scheduleFinalFrameUpdate: () => void;
  session: SelectionModeSession;
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
    flushFinalFrameUpdate: args.flushFinalFrameUpdate,
    minSelectionSize: args.minSelectionSize,
    scheduleFinalFrameUpdate: args.scheduleFinalFrameUpdate,
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

export type SelectionModeRuntimeActionsArgs = ReturnType<typeof createSelectionModeRuntimeSetup>;

function createListenerHandlers(args: SelectionModeRuntimePointerHandlers) {
  return {
    handleClick: args.handleClick,
    handleDragStart: args.handleDragStart,
    handleKeyDown: args.handleKeyDown,
    handleMouseDown: args.handleMouseDown,
    handleMouseLeave: args.handleMouseLeave,
    handleMouseMove: args.handleMouseMove,
    handleMouseUp: args.handleMouseUp,
  };
}
