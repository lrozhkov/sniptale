import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';
import type { SelectionModeRuntimeState } from '../../session/runtime-state/types';
import type { SelectionModeRuntimeActionsArgs } from '../../interaction/actions/types';

export type SelectionModeEventsBridgeRuntimeArgs = SelectionModeRuntimeActionsArgs & {
  state: SelectionModeRuntimeState;
};

export type SelectionModeEventsBridgeArgs = {
  cleanupEvent: () => void;
  currentSelection: () => { x: number; y: number; width: number; height: number };
  disableCursor: () => void;
  getRejectCallback: () => ((error: Error) => void) | null;
  getResolveCallback: () => ((value: CaptureArea) => void) | null;
  handleKeyDown: (event: KeyboardEvent) => void;
  runtimeArgs: SelectionModeEventsBridgeRuntimeArgs;
};
