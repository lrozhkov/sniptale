export type SelectionModeRuntimeActionsArgs = ReturnType<
  typeof import('../../runtime/setup').createSelectionModeRuntimeSetup
>;

export type SelectionModeDragSelectionRuntime = ReturnType<
  typeof import('.').applySelectionModeDragSelection
>;
