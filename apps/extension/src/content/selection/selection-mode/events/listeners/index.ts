import {
  addEventListenerToAllWindowsDynamic,
  addScrollListenersToAllWindows,
} from '../../../../platform/frame';
import { logSelectionModeRuntime } from '../../diag';
import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';
import type { SelectionModeRuntimePointerHandlers } from '../../runtime/setup';

interface SelectionModeListenerArgs extends SelectionModeRuntimePointerHandlers {
  currentState: () => string;
  hideHoverFrame: () => void;
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
  setCleanupScrollListeners: (cleanup: (() => void) | null) => void;
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
  args.setCleanupScrollListeners(
    addScrollListenersToAllWindows(() => {
      const currentState = args.currentState();
      if (currentState === 'hover' || currentState === 'idle') {
        args.hideHoverFrame();
      }
    })
  );
}

export function setupSelectionModeEventListeners(args: SelectionModeListenerArgs): void {
  logSelectionModeRuntime('Attaching selection listeners');
  const cleanupListeners = attachPointerListeners(args);
  attachScrollListeners(args);

  args.setCleanupEventListeners(() => {
    logSelectionModeRuntime('Cleaning selection listeners');
    cleanupListeners.forEach((cleanupListener) => {
      cleanupListener();
    });
  });
}

export function setupSelectionModeRuntimeListeners(args: SelectionModeRuntimeActionsArgs): void {
  setupSelectionModeEventListeners({
    currentState: () => args.state.currentState,
    handleClick: args.setupListenerHandlers.handleClick,
    handleKeyDown: args.setupListenerHandlers.handleKeyDown,
    handleMouseDown: args.setupListenerHandlers.handleMouseDown,
    handleMouseLeave: args.setupListenerHandlers.handleMouseLeave,
    handleMouseMove: args.setupListenerHandlers.handleMouseMove,
    handleMouseUp: args.setupListenerHandlers.handleMouseUp,
    hideHoverFrame: args.hideHoverFrame,
    setCleanupEventListeners: args.setCleanupEventListeners,
    setCleanupScrollListeners: args.setCleanupScrollListeners,
  });
}
