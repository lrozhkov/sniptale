import { translate } from '../../../platform/i18n';
import { createScenarioProjectRecordV3 } from '../../../composition/persistence/scenario/store/v3';
import type {
  ScenarioCreateProjectMessage,
  ScenarioSetActiveProjectMessage,
} from '../../../contracts/messaging/contracts/types';
import { resolveProjectSelection } from '../router/helpers';
import {
  buildScenarioPayloadResponse,
  flushScenarioProjectCapture,
  setScenarioProjectSelection,
  type ScenarioRouteContext,
} from '../router/action-helpers';

export async function handleScenarioSetActiveProject(
  args: ScenarioRouteContext & { message: ScenarioSetActiveProjectMessage }
) {
  const projectSelection = await resolveProjectSelection(args.message.projectId);
  await setScenarioProjectSelection({
    ...args,
    projectSelection,
    rememberProjectSelection: args.message.rememberProjectSelection ?? true,
  });
  const flushedCapture = projectSelection.id
    ? await flushScenarioProjectCapture({ ...args, projectId: projectSelection.id })
    : {};

  return {
    ...(await buildScenarioPayloadResponse(args)),
    projectId: projectSelection.id ?? undefined,
    ...flushedCapture,
  };
}

export async function handleScenarioCreateProject(
  args: ScenarioRouteContext & { message: ScenarioCreateProjectMessage }
) {
  const projectName = args.message.name.trim() || translate('scenario.common.defaultProjectName');
  const project = await createScenarioProjectRecordV3(projectName);
  await args.scenarioSessionService.bumpProjectRevision(args.resolvedTabId);
  await setScenarioProjectSelection({
    ...args,
    projectSelection: { id: project.id, name: project.name },
    rememberProjectSelection: args.message.rememberProjectSelection ?? true,
  });
  const flushedCapture = await flushScenarioProjectCapture({
    ...args,
    projectId: project.id,
  });

  return {
    ...(await buildScenarioPayloadResponse(args)),
    projectId: project.id,
    ...flushedCapture,
  };
}
