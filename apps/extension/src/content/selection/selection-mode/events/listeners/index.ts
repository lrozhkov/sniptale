import {
  addEventListenerToAllWindowsDynamic,
  addScrollListenersToAllWindows,
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
  return [
    addEventListenerToAllWindowsDynamic<MouseEvent>('mousemove', args.handleMouseMove, {
      capture: true,
    }),
    addEventListenerToAllWindowsDynamic<MouseEvent>('mousedown', args.handleMouseDown, {
      capture: true,
    }),
    addEventListenerToAllWindowsDynamic<MouseEvent>('mouseup', args.handleMouseUp, {
      capture: true,
    }),
    addEventListenerToAllWindowsDynamic<MouseEvent>('click', args.handleClick, { capture: true }),
    addEventListenerToAllWindowsDynamic<KeyboardEvent>('keydown', args.handleKeyDown, {
      capture: true,
    }),
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
    handleKeyDown: args.setupListenerHandlers.handleKeyDown,
    handleMouseDown: args.setupListenerHandlers.handleMouseDown,
    handleMouseLeave: args.setupListenerHandlers.handleMouseLeave,
    handleMouseMove: args.setupListenerHandlers.handleMouseMove,
    handleMouseUp: args.setupListenerHandlers.handleMouseUp,
    hideHoverFrame: args.hideHoverFrame,
    session: args.session,
  });
}
