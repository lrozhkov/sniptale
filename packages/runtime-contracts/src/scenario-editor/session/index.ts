const SCENARIO_PROJECT_QUERY_PARAM = 'projectId';
const SCENARIO_STEP_QUERY_PARAM = 'stepId';
const SCENARIO_PRESENTATION_VIEW_QUERY_PARAM = 'presentationView';
const SCENARIO_PRESENTATION_SESSION_QUERY_PARAM = 'presentationSessionId';

export const SCENARIO_PRESENTATION_VIEWS = {
  audience: 'audience',
} as const;

export type ScenarioPresentationView =
  (typeof SCENARIO_PRESENTATION_VIEWS)[keyof typeof SCENARIO_PRESENTATION_VIEWS];

/**
 * Reads the current scenario project id from the editor query string.
 */
export function readScenarioEditorProjectId(search: string): string | null {
  return new URLSearchParams(search).get(SCENARIO_PROJECT_QUERY_PARAM);
}

/**
 * Reads the current scenario step id from the editor query string.
 */
export function readScenarioEditorStepId(search: string): string | null {
  return new URLSearchParams(search).get(SCENARIO_STEP_QUERY_PARAM);
}

export function readScenarioEditorPresentationView(
  search: string
): ScenarioPresentationView | null {
  const value = new URLSearchParams(search).get(SCENARIO_PRESENTATION_VIEW_QUERY_PARAM);
  return value === SCENARIO_PRESENTATION_VIEWS.audience ? value : null;
}

export function readScenarioEditorPresentationSessionId(search: string): string | null {
  return new URLSearchParams(search).get(SCENARIO_PRESENTATION_SESSION_QUERY_PARAM);
}
