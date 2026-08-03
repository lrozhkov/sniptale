export const SCENARIO_EDITOR_MODES = {
  edit: 'edit',
  play: 'play',
} as const;

export type ScenarioEditorMode = (typeof SCENARIO_EDITOR_MODES)[keyof typeof SCENARIO_EDITOR_MODES];
