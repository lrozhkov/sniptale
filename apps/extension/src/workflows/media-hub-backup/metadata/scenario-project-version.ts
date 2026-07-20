import type { ScenarioProjectEntry } from '../../../composition/persistence/scenario/contracts';
import { translate } from '../../../platform/i18n';
import { isScenarioProjectV3 } from '../../../features/scenario/project/v3';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

type SupportedScenarioBackupProjectEntry = ScenarioProjectEntry & {
  project: ScenarioProjectV3;
};

export function assertSupportedScenarioBackupProjectEntry(
  entry: ScenarioProjectEntry
): asserts entry is SupportedScenarioBackupProjectEntry {
  if (!isScenarioProjectV3(entry.project)) {
    throw new Error(
      `${translate('shared.mediaHub.backupUnsupportedVersionPrefix')} scenario project ${entry.project.version}.`
    );
  }
}
