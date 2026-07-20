import { handleSelectionModeClick, handleSelectionModeKeyDown } from '..';
import { getSelectionModeResolvedTagName, logSelectionModeEvent } from './helpers';
import type { SelectionModeEventHandlersContext } from './types';

export function createSelectionModeActivationHandlers(args: SelectionModeEventHandlersContext) {
  return {
    handleClick(event: MouseEvent, iframe?: HTMLIFrameElement) {
      logSelectionModeEvent('Click received', {
        currentState: args.state.currentState,
        tagName: getSelectionModeResolvedTagName(event, iframe),
      });
      args.withStateSync(() =>
        handleSelectionModeClick(event, args.state, args.selectionModeEvents, iframe)
      );
    },
    handleKeyDown(event: KeyboardEvent) {
      logSelectionModeEvent('KeyDown received', {
        currentState: args.state.currentState,
        key: event.key,
      });
      args.withStateSync(() =>
        handleSelectionModeKeyDown(event, args.state, args.selectionModeEvents)
      );
    },
  };
}
