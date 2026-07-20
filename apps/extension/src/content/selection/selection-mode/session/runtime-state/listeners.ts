import type { SelectionModeRuntimePointerHandlers } from './types';

export function createSelectionModeSetupListenerHandlers(
  args: SelectionModeRuntimePointerHandlers
) {
  return {
    handleClick: args.handleClick,
    handleKeyDown: args.handleKeyDown,
    handleMouseDown: args.handleMouseDown,
    handleMouseLeave: args.handleMouseLeave,
    handleMouseMove: args.handleMouseMove,
    handleMouseUp: args.handleMouseUp,
  };
}
