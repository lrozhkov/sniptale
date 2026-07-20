import { translate } from '../../../platform/i18n';
import { createScenarioProjectRecordV3 } from '../../../composition/persistence/scenario/store/v3';
import type { ScenarioPageDescriptor } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioSessionService } from '../session-service';

function formatScenarioProjectTimestamp(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(createdAt));
}

function createAutoScenarioProjectName(args: {
  createdAt?: number;
  page: ScenarioPageDescriptor;
}): string {
  const createdAt = args.createdAt ?? Date.now();
  const baseName = args.page.title?.trim() || translate('scenario.common.defaultProjectName');
  return `${baseName} • ${formatScenarioProjectTimestamp(createdAt)}`;
}

export async function ensureScenarioCaptureProject(args: {
  createdAt?: number;
  page: ScenarioPageDescriptor;
  scenarioSessionService: ScenarioSessionService;
  tabId: number;
}) {
  const session = await args.scenarioSessionService.getSession(args.tabId);
  if (session.projectId) {
    return {
      id: session.projectId,
      name: session.projectName,
    };
  }

  const project = await createScenarioProjectRecordV3(
    createAutoScenarioProjectName({
      ...(args.createdAt !== undefined ? { createdAt: args.createdAt } : {}),
      page: args.page,
    })
  );
  await args.scenarioSessionService.bumpProjectRevision(args.tabId);
  await args.scenarioSessionService.setActiveProject(
    args.tabId,
    { id: project.id, name: project.name },
    { rememberProjectSelection: true }
  );

  return {
    id: project.id,
    name: project.name,
  };
}
