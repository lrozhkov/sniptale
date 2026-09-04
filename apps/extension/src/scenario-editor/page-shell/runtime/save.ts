import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';
import { saveScenarioProjectRecordV3 } from '../../../composition/persistence/scenario/store/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

interface SaveScenarioV3EditorProjectOptions {
  baseUpdatedAt: number | null;
}

export function getScenarioV3RuntimeErrorMessage(error: unknown): string {
  return createUserFacingErrorMessage({
    cause: error,
    detail: 'storage',
    summaryKey: 'scenario.editor.v3OperationFailed',
  });
}

export function saveScenarioV3EditorProject(
  project: ScenarioProjectV3,
  options: SaveScenarioV3EditorProjectOptions
): Promise<ScenarioProjectV3> {
  return saveScenarioProjectRecordV3(project, {
    baseUpdatedAt: options.baseUpdatedAt,
  });
}
