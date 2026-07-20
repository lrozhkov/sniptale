import type { ScenarioSaveCaptureStepMessage } from '../../../contracts/messaging/contracts/types';
import type { ScenarioSessionService } from '../session-service';
import {
  buildScenarioCaptureSaveFields,
  buildScenarioSessionPayload,
  flushPendingCaptureIfNeeded,
  saveScenarioCaptureForProject,
} from './helpers';

export type ScenarioRouteContext = {
  resolvedTabId: number;
  scenarioSessionService: ScenarioSessionService;
};

interface ScenarioProjectSelection {
  id: string | null;
  name: string | null;
}

export async function buildScenarioPayloadResponse(args: ScenarioRouteContext) {
  return {
    success: true,
    ...(await buildScenarioSessionPayload(args.resolvedTabId, args.scenarioSessionService)),
  };
}

export async function setScenarioProjectSelection(
  args: ScenarioRouteContext & {
    projectSelection: ScenarioProjectSelection;
    rememberProjectSelection: boolean;
  }
) {
  await args.scenarioSessionService.setActiveProject(args.resolvedTabId, args.projectSelection, {
    rememberProjectSelection: args.rememberProjectSelection,
  });
}

export async function flushScenarioProjectCapture(
  args: ScenarioRouteContext & { projectId: string }
) {
  const flushedCapture = await flushPendingCaptureIfNeeded(
    args.resolvedTabId,
    args.projectId,
    args.scenarioSessionService
  );
  if (flushedCapture.stepId) {
    await args.scenarioSessionService.bumpProjectRevision(args.resolvedTabId);
  }

  return flushedCapture;
}

export async function saveCaptureStepToScenarioProject(
  message: ScenarioSaveCaptureStepMessage,
  projectId: string
) {
  return saveScenarioCaptureForProject(projectId, buildScenarioCaptureSaveFields(message));
}
