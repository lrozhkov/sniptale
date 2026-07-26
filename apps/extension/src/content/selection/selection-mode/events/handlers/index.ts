import { getContentEventTargetElement } from '../../../../platform/dom-host';
import { resolveIframeEventTarget } from '../../../../platform/frame';
import { logSelectionModeRuntime } from '../../diag';
import type { SelectionModeInteractionState } from '../types';
import { handleSelectionModeClick, handleSelectionModeKeyDown } from '../commands';
import {
  handleSelectionModeMouseDown,
  handleSelectionModeMouseLeave,
  handleSelectionModeMouseMove,
  handleSelectionModeMouseUp,
} from '../pointer-handlers';

type SelectionModeEventHandlersDeps = {
  cancelSelection: () => void;
  closeCaptureActionMenu: (restoreFocus: boolean) => boolean;
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
  flushFinalFrameUpdate: () => void;
  resetToIdleState: () => void;
  updateFinalFrame: () => void;
};

type SelectionModeEventHandlersArgs = {
  selectionModeEvents: SelectionModeEventHandlersDeps & {
    constrainSelection: () => void;
  };
  state: SelectionModeInteractionState;
};

type SelectionModeEventHandlersContext = {
  selectionModeEvents: SelectionModeEventHandlersDeps;
  state: SelectionModeInteractionState;
};

export function createSelectionModeEventHandlers(args: SelectionModeEventHandlersArgs) {
  return {
    ...createSelectionModeActivationHandlers(args),
    ...createSelectionModePointerHandlers(args),
  };
}

function createSelectionModeActivationHandlers(args: SelectionModeEventHandlersContext) {
  return {
    handleClick(event: MouseEvent, iframe?: HTMLIFrameElement) {
      logSelectionModeEvent('Click received', {
        currentState: args.state.currentState,
        tagName: getSelectionModeResolvedTagName(event, iframe),
      });
      handleSelectionModeClick(event, args.state, args.selectionModeEvents, iframe);
    },
    handleKeyDown(event: KeyboardEvent) {
      logSelectionModeEvent('KeyDown received', {
        currentState: args.state.currentState,
        key: event.key,
      });
      handleSelectionModeKeyDown(event, args.state, args.selectionModeEvents);
    },
  };
}

function createSelectionModePointerLogger(
  state: SelectionModeEventHandlersContext['state'],
  hoveredElement: HTMLElement | null,
  event: MouseEvent
): void {
  if (state.currentState !== 'idle' && state.currentState !== 'hover') {
    return;
  }

  const target = getContentEventTargetElement(event);
  if (!target || target === hoveredElement) {
    return;
  }

  logSelectionModeEvent('MouseMove target changed', {
    currentState: state.currentState,
    tagName: target.tagName,
  });
}

function createSelectionModePointerLifecycleHandlers(args: SelectionModeEventHandlersContext) {
  return {
    handleMouseDown(event: MouseEvent, iframe?: HTMLIFrameElement) {
      logSelectionModeEvent('MouseDown received', {
        currentState: args.state.currentState,
        tagName: getSelectionModeResolvedTagName(event, iframe),
      });
      handleSelectionModeMouseDown(event, args.state, args.selectionModeEvents, iframe);
    },
    handleMouseUp() {
      logSelectionModeEvent('MouseUp received', {
        currentState: args.state.currentState,
      });
      handleSelectionModeMouseUp(args.state, args.selectionModeEvents);
    },
  };
}

function createSelectionModePointerMoveHandler(args: SelectionModeEventHandlersContext) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement) => {
    createSelectionModePointerLogger(args.state, args.state.hoveredElement, event);
    handleSelectionModeMouseMove(event, args.state, args.selectionModeEvents, iframe);
  };
}

function createSelectionModePointerHandlers(args: SelectionModeEventHandlersContext) {
  const lifecycleHandlers = createSelectionModePointerLifecycleHandlers(args);
  const handleMouseMove = createSelectionModePointerMoveHandler(args);

  return {
    ...lifecycleHandlers,
    handleMouseLeave() {
      handleSelectionModeMouseLeave(args.state, args.selectionModeEvents);
    },
    handleMouseMove,
  };
}

function logSelectionModeEvent(eventName: string, details: Record<string, unknown>): void {
  logSelectionModeRuntime(eventName, details);
}

function getSelectionModeResolvedTagName(
  event: MouseEvent,
  iframe?: HTMLIFrameElement
): string | undefined {
  return (resolveIframeEventTarget(event, iframe) ?? getContentEventTargetElement(event))?.tagName;
}
