import type { ScenarioSaveCaptureStepMessage } from '../../../contracts/messaging/scenario/types';
import { ensureScenarioCaptureProject } from '../router/project-selection';
import {
  buildScenarioPayloadResponse,
  saveCaptureStepToScenarioProject,
  setScenarioProjectSelection,
  type ScenarioRouteContext,
} from '../router/action-helpers';

export async function handleScenarioSaveCaptureStep(
  args: ScenarioRouteContext & { message: ScenarioSaveCaptureStepMessage }
) {
  const session = await args.scenarioSessionService.getSession(args.resolvedTabId);
  const projectSelection = session.projectId
    ? { id: session.projectId, name: session.projectName }
    : await ensureScenarioCaptureProject({
        page: args.message.page,
        scenarioSessionService: args.scenarioSessionService,
        tabId: args.resolvedTabId,
      });
  if (!projectSelection.id) {
    return buildScenarioPayloadResponse(args);
  }

  const result = await saveCaptureStepToScenarioProject(args.message, projectSelection.id);
  await args.scenarioSessionService.bumpProjectRevision(args.resolvedTabId);
  await setScenarioProjectSelection({
    ...args,
    projectSelection: { id: result.project.id, name: result.project.name },
    rememberProjectSelection: true,
  });

  return {
    ...(await buildScenarioPayloadResponse(args)),
    projectId: result.project.id,
    stepId: result.slide.id,
  };
}
