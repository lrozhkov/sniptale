import { createSelectionModeEventHandlers } from '../events/handlers';
import { createSelectionModeEventsBridge } from '../events/bridge';
import { createSelectionModeRuntimeSetup } from './setup';
import type { Selection } from '../types';
import type { SelectionModeMutableRefs } from '../session/locals-contract';
import type { CaptureArea } from '@sniptale/runtime-contracts/messaging/capture-messages';

export type SelectionModeRuntimeGraphBindingsArgs = {
  cleanup: () => void;
  currentSelection: () => Selection;
  disableCursor: () => void;
  getMaxSelectionHeight: () => number;
  getMaxSelectionWidth: () => number;
  getRejectCallback: () => ((error: Error) => void) | null;
  getResolveCallback: () => ((area: CaptureArea) => void) | null;
  minSelectionSize: number;
  mutableRefs: SelectionModeMutableRefs;
  selectionModeUiRuntime: {
    createDragFrame: () => void;
    createFinalElements: () => void;
  };
  setCleanupEventListeners: (cleanup: (() => void) | null) => void;
  setCleanupScrollListeners: (cleanup: (() => void) | null) => void;
  state: ReturnType<typeof import('../session/state').createSelectionModeState>;
  updateFinalFrame: () => void;
  zIndexBase: number;
};

function createSelectionModeRuntimeArgsBinding(
  args: SelectionModeRuntimeGraphBindingsArgs,
  getHandlers: () => ReturnType<typeof createSelectionModeEventHandlers>
) {
  return createSelectionModeRuntimeSetup({
    createDragFrame: () => args.selectionModeUiRuntime.createDragFrame(),
    createFinalElements: () => args.selectionModeUiRuntime.createFinalElements(),
    getMaxSelectionHeight: args.getMaxSelectionHeight,
    getMaxSelectionWidth: args.getMaxSelectionWidth,
    handleClick: (event, iframe) => getHandlers().handleClick(event, iframe),
    handleKeyDown: (event) => getHandlers().handleKeyDown(event),
    handleMouseDown: (event, iframe) => getHandlers().handleMouseDown(event, iframe),
    handleMouseLeave: () => getHandlers().handleMouseLeave(),
    handleMouseMove: (event, iframe) => getHandlers().handleMouseMove(event, iframe),
    handleMouseUp: () => getHandlers().handleMouseUp(),
    minSelectionSize: args.minSelectionSize,
    mutableRefs: args.mutableRefs,
    setCleanupEventListeners: args.setCleanupEventListeners,
    setCleanupScrollListeners: args.setCleanupScrollListeners,
    updateFinalFrame: args.updateFinalFrame,
    zIndexBase: args.zIndexBase,
  });
}

function createSelectionModeEventsBinding(
  args: SelectionModeRuntimeGraphBindingsArgs,
  runtimeArgs: ReturnType<typeof createSelectionModeRuntimeSetup>,
  getHandlers: () => ReturnType<typeof createSelectionModeEventHandlers>
) {
  return createSelectionModeEventsBridge({
    cleanupEvent: args.cleanup,
    currentSelection: args.currentSelection,
    disableCursor: args.disableCursor,
    getRejectCallback: args.getRejectCallback,
    getResolveCallback: args.getResolveCallback,
    handleKeyDown: (event) => getHandlers().handleKeyDown(event),
    runtimeArgs,
  });
}

export function createSelectionModeRuntimeGraphBindings(
  args: SelectionModeRuntimeGraphBindingsArgs
) {
  let selectionModeEventHandlers: ReturnType<typeof createSelectionModeEventHandlers>;
  const getHandlers = () => selectionModeEventHandlers;
  const selectionModeRuntimeArgs = createSelectionModeRuntimeArgsBinding(args, getHandlers);
  const selectionModeEvents = createSelectionModeEventsBinding(
    args,
    selectionModeRuntimeArgs,
    getHandlers
  );

  selectionModeEventHandlers = createSelectionModeEventHandlers({
    selectionModeEvents,
    state: selectionModeRuntimeArgs.state,
  });

  return { selectionModeEvents, selectionModeRuntimeArgs };
}
