import type { ScenarioRuntimeCapturePayload } from '../../../contracts/messaging/contracts/types';
import { saveScenarioCaptureSlideToProject } from '../../../composition/persistence/scenario/store/v3';
import type { ScenarioSessionService } from '../../scenario/session-service/index';
import { ensureScenarioCaptureProject } from '../../scenario/router/project-selection';

function buildScenarioSaveArgs(args: {
  dataUrl: string;
  galleryAssetId: string | null;
  projectId: string;
  scenarioCapture: ScenarioRuntimeCapturePayload;
}) {
  return {
    projectId: args.projectId,
    dataUrl: args.dataUrl,
    ...(args.galleryAssetId === null
      ? { galleryAssetId: null }
      : { galleryAssetId: args.galleryAssetId }),
    captureSurface: args.scenarioCapture.captureSurface,
    sourceKind: args.scenarioCapture.sourceKind,
    page: args.scenarioCapture.page,
    ...(args.scenarioCapture.target === undefined ? {} : { target: args.scenarioCapture.target }),
    ...(args.scenarioCapture.interactionPoint === undefined
      ? {}
      : { interactionPoint: args.scenarioCapture.interactionPoint }),
    ...(args.scenarioCapture.cursorPoint === undefined
      ? {}
      : { cursorPoint: args.scenarioCapture.cursorPoint }),
    ...(args.scenarioCapture.captureMetadata === undefined
      ? {}
      : { captureMetadata: args.scenarioCapture.captureMetadata }),
    ...(args.scenarioCapture.title === undefined ? {} : { title: args.scenarioCapture.title }),
    ...(args.scenarioCapture.body === undefined ? {} : { body: args.scenarioCapture.body }),
  };
}

export async function persistScenarioCaptureFromBackground(args: {
  dataUrl: string;
  galleryAssetId: string | null;
  scenarioCapture?: ScenarioRuntimeCapturePayload;
  tabId: number;
  scenarioSessionService: ScenarioSessionService;
}): Promise<void> {
  if (!args.scenarioCapture) {
    return;
  }

  const session = await args.scenarioSessionService.getSession(args.tabId);
  if (!session.enabled) {
    return;
  }

  const projectSelection = session.projectId
    ? { id: session.projectId, name: session.projectName }
    : await ensureScenarioCaptureProject({
        page: args.scenarioCapture.page,
        scenarioSessionService: args.scenarioSessionService,
        tabId: args.tabId,
      });
  if (!projectSelection.id) {
    return;
  }

  await saveScenarioCaptureSlideToProject(
    buildScenarioSaveArgs({
      dataUrl: args.dataUrl,
      galleryAssetId: args.galleryAssetId,
      projectId: projectSelection.id,
      scenarioCapture: args.scenarioCapture,
    })
  );
  await args.scenarioSessionService.bumpProjectRevision(args.tabId);
}
