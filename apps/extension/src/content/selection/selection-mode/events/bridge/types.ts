import type { SelectionModeSession } from '../../session';
import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';

export type SelectionModeEventsBridgeRuntimeArgs = SelectionModeRuntimeActionsArgs & {
  state: SelectionModeSession;
};

export type SelectionModeEventsBridgeArgs = {
  cleanupEvent: () => void;
  disableCursor: () => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  runtimeArgs: SelectionModeEventsBridgeRuntimeArgs;
};
