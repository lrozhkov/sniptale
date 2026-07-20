import { createSelectionModeRuntimeGraphBindings } from './graph-bindings';
import type { SelectionModeRuntimeGraphBindingsArgs } from './graph-bindings';

export function createSelectionModeRuntimeGraph(args: {
  cleanup: SelectionModeRuntimeGraphBindingsArgs['cleanup'];
  currentSelection: SelectionModeRuntimeGraphBindingsArgs['currentSelection'];
  disableCursor: SelectionModeRuntimeGraphBindingsArgs['disableCursor'];
  getMaxSelectionHeight: SelectionModeRuntimeGraphBindingsArgs['getMaxSelectionHeight'];
  getMaxSelectionWidth: SelectionModeRuntimeGraphBindingsArgs['getMaxSelectionWidth'];
  getRejectCallback: SelectionModeRuntimeGraphBindingsArgs['getRejectCallback'];
  getResolveCallback: SelectionModeRuntimeGraphBindingsArgs['getResolveCallback'];
  minSelectionSize: SelectionModeRuntimeGraphBindingsArgs['minSelectionSize'];
  mutableRefs: SelectionModeRuntimeGraphBindingsArgs['mutableRefs'];
  selectionModeUiRuntime: SelectionModeRuntimeGraphBindingsArgs['selectionModeUiRuntime'];
  setCleanupEventListeners: SelectionModeRuntimeGraphBindingsArgs['setCleanupEventListeners'];
  setCleanupScrollListeners: SelectionModeRuntimeGraphBindingsArgs['setCleanupScrollListeners'];
  state: SelectionModeRuntimeGraphBindingsArgs['state'];
  updateFinalFrame: SelectionModeRuntimeGraphBindingsArgs['updateFinalFrame'];
  zIndexBase: SelectionModeRuntimeGraphBindingsArgs['zIndexBase'];
}) {
  return createSelectionModeRuntimeGraphBindings(args);
}
