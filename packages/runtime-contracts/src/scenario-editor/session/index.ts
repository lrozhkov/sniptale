const SCENARIO_PROJECT_QUERY_PARAM = 'projectId';
const SCENARIO_STEP_QUERY_PARAM = 'stepId';

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
