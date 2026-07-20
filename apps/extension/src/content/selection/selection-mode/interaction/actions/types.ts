export type SelectionModeRuntimeActionsArgs = ReturnType<
  typeof import('../../session/runtime-state/args').createSelectionModeRuntimeArgs
>;

export type SelectionModeDragSelectionRuntime = ReturnType<
  typeof import('.').applySelectionModeDragSelection
>;
