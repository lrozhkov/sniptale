import {
  createScenarioProjectRecordV3,
  getScenarioProjectRecordV3,
  listScenarioProjectSummariesV3,
} from '../../../composition/persistence/scenario/store/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

export async function loadScenarioV3EditorProject(
  requestedProjectId: string | null,
  createProjectName: string
): Promise<ScenarioProjectV3> {
  if (requestedProjectId) {
    const requestedProject = await getScenarioProjectRecordV3(requestedProjectId);
    if (requestedProject) {
      return requestedProject;
    }
  }

  const summaries = await listScenarioProjectSummariesV3();
  const latestProjectId = summaries[0]?.id;
  if (latestProjectId) {
    const latestProject = await getScenarioProjectRecordV3(latestProjectId);
    if (latestProject) {
      return latestProject;
    }
  }

  return createScenarioProjectRecordV3(createProjectName);
}
