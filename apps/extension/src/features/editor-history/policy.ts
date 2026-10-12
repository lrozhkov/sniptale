/** Product Undo+Redo budget; adapters retain current content independently. */
export const EDITOR_HISTORY_LIMITS = Object.freeze({ maxActions: 50, maxBytes: 8 * 1024 * 1024 });

/** Previous committed Scenario checkpoints have a separate budget from user Undo. */
export const SCENARIO_SAVED_VERSION_LIMITS = Object.freeze({
  maxActions: 20,
  maxBytes: 16 * 1024 * 1024,
});
