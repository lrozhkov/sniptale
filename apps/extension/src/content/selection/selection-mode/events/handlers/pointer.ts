import {
  handleSelectionModeMouseDown,
  handleSelectionModeMouseLeave,
  handleSelectionModeMouseMove,
  handleSelectionModeMouseUp,
} from '..';
import { getContentEventTargetElement } from '../../../../platform/dom-host';
import { getSelectionModeResolvedTagName, logSelectionModeEvent } from './helpers';
import type { SelectionModeEventHandlersContext } from './types';

export function createSelectionModePointerLogger(
  state: SelectionModeEventHandlersContext['state'],
  hoveredElement: HTMLElement | null,
  event: MouseEvent
): void {
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
      args.withStateSync(() =>
        handleSelectionModeMouseDown(event, args.state, args.selectionModeEvents, iframe)
      );
    },
    handleMouseUp() {
      logSelectionModeEvent('MouseUp received', {
        currentState: args.state.currentState,
      });
      args.withStateSync(() => handleSelectionModeMouseUp(args.state, args.selectionModeEvents));
    },
  };
}

export function createSelectionModePointerMoveHandler(args: SelectionModeEventHandlersContext) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement) => {
    createSelectionModePointerLogger(args.state, args.state.hoveredElement, event);
    args.withStateSync(() =>
      handleSelectionModeMouseMove(event, args.state, args.selectionModeEvents, iframe)
    );
  };
}

export function createSelectionModePointerHandlers(args: SelectionModeEventHandlersContext) {
  const lifecycleHandlers = createSelectionModePointerLifecycleHandlers(args);
  const handleMouseMove = createSelectionModePointerMoveHandler(args);

  return {
    ...lifecycleHandlers,
    handleMouseLeave() {
      args.withStateSync(() => handleSelectionModeMouseLeave(args.state, args.selectionModeEvents));
    },
    handleMouseMove,
  };
}
