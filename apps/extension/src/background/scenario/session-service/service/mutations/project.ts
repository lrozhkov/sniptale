import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';

export function setScenarioSessionActiveProject(
  session: ScenarioSessionState,
  project: { id: string | null; name: string | null },
  options: { rememberProjectSelection?: boolean } = {},
  hasPendingCapture: boolean
): ScenarioSessionState {
  session.projectId = project.id;
  session.projectName = project.name;
  session.rememberProjectSelection = project.id ? (options.rememberProjectSelection ?? true) : true;
  session.pendingProjectSelection = project.id ? false : hasPendingCapture;
  return session;
}
