import {
  addEventListenerToAllWindowsDynamic,
  addScrollListenersToAllWindows,
  addWindowEventListenerToAllWindowsDynamic,
} from '../../../../platform/frame';
import { logSelectionModeRuntime } from '../../diag';
import type { SelectionModeSession } from '../../session';
import type { SelectionModeRuntimePointerHandlers } from '../../runtime/setup';

interface SelectionModeListenerArgs extends SelectionModeRuntimePointerHandlers {
  hideHoverFrame: () => void;
  session: SelectionModeSession;
}

interface SelectionModeRuntimeListenerArgs {
  hideHoverFrame: () => void;
  session: SelectionModeSession;
  setupListenerHandlers: SelectionModeRuntimePointerHandlers;
}

function attachPointerListeners(args: SelectionModeListenerArgs): Array<() => void> {
  const addWindowGestureListener = <E extends Event>(
    eventType: string,
    handler: (event: E, iframe?: HTMLIFrameElement) => void
  ) =>
    addWindowEventListenerToAllWindowsDynamic<E>(
      eventType,
      (event, _currentWindow, iframe) => handler(event, iframe),
      { capture: true }
    );

  return [
    addWindowGestureListener<DragEvent>('dragstart', args.handleDragStart),
    addWindowGestureListener<MouseEvent>('mousemove', args.handleMouseMove),
    addWindowGestureListener<MouseEvent>('mousedown', args.handleMouseDown),
    addWindowGestureListener<MouseEvent>('mouseup', args.handleMouseUp),
    addWindowGestureListener<MouseEvent>('click', args.handleClick),
    addWindowGestureListener<KeyboardEvent>('keydown', args.handleKeyDown),
    addEventListenerToAllWindowsDynamic<MouseEvent>(
      'mouseleave',
      () => {
        args.handleMouseLeave();
      },
      { capture: true }
    ),
  ];
}

function attachScrollListeners(args: SelectionModeListenerArgs): void {
  args.session.cleanupScrollListeners = addScrollListenersToAllWindows(() => {
    const currentState = args.session.currentState;
    if (currentState === 'hover' || currentState === 'idle') {
      args.hideHoverFrame();
    }
  });
}

function setupSelectionModeEventListeners(args: SelectionModeListenerArgs): void {
  logSelectionModeRuntime('Attaching selection listeners');
  const cleanupListeners = attachPointerListeners(args);
  attachScrollListeners(args);

  args.session.cleanupEventListeners = () => {
    logSelectionModeRuntime('Cleaning selection listeners');
    cleanupListeners.forEach((cleanupListener) => {
      cleanupListener();
    });
  };
}

export function setupSelectionModeRuntimeListeners(args: SelectionModeRuntimeListenerArgs): void {
  setupSelectionModeEventListeners({
    handleClick: args.setupListenerHandlers.handleClick,
    handleDragStart: args.setupListenerHandlers.handleDragStart,
    handleKeyDown: args.setupListenerHandlers.handleKeyDown,
    handleMouseDown: args.setupListenerHandlers.handleMouseDown,
    handleMouseLeave: args.setupListenerHandlers.handleMouseLeave,
    handleMouseMove: args.setupListenerHandlers.handleMouseMove,
    handleMouseUp: args.setupListenerHandlers.handleMouseUp,
    hideHoverFrame: args.hideHoverFrame,
    session: args.session,
  });
}
