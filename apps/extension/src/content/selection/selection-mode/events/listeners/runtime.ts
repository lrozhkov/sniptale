import { setupSelectionModeEventListeners } from '.';
import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';

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
