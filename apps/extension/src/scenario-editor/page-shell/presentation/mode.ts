export const SCENARIO_EDITOR_MODES = {
  edit: 'edit',
  overview: 'overview',
  play: 'play',
  presenter: 'presenter',
} as const;

export type ScenarioEditorMode = (typeof SCENARIO_EDITOR_MODES)[keyof typeof SCENARIO_EDITOR_MODES];
