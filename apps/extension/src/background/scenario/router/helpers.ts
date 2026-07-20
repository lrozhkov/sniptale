import {
  getScenarioProjectRecordV3,
  listScenarioProjectSummariesV3,
  saveScenarioCaptureSlideToProject,
} from '../../../composition/persistence/scenario/store/v3';
import type { ScenarioSaveCaptureStepMessage } from '../../../contracts/messaging/contracts/types';
import type { ScenarioSessionService } from '../session-service';
import type { PendingScenarioCapture, PendingScenarioCaptureInput } from '../session-service/types';
import { buildScenarioProjectStepPayload } from './step-payload';

interface ScenarioCaptureSaveFields {
  body: string;
  captureMetadata?: PendingScenarioCapture['captureMetadata'];
  captureSurface: PendingScenarioCapture['captureSurface'];
  cursorPoint: PendingScenarioCapture['cursorPoint'];
  dataUrl: string;
  galleryAssetId: string | null;
  interactionPoint: PendingScenarioCapture['interactionPoint'];
  page: PendingScenarioCapture['page'];
  sourceKind: PendingScenarioCapture['sourceKind'];
  target: PendingScenarioCapture['target'];
  title: string;
}

function createDefaultCaptureMetadata(): NonNullable<PendingScenarioCapture['captureMetadata']> {
  return {
    pointerRange: null,
    scroll: null,
    trigger: 'pointer-up',
  };
}

export function buildScenarioCaptureSaveFields(
  message: ScenarioSaveCaptureStepMessage
): ScenarioCaptureSaveFields {
  return {
    dataUrl: message.dataUrl,
    galleryAssetId: message.galleryAssetId ?? null,
    captureSurface: message.captureSurface,
    sourceKind: message.sourceKind,
    page: message.page,
    target: message.target ?? null,
    interactionPoint: message.interactionPoint ?? null,
    cursorPoint: message.cursorPoint ?? null,
    captureMetadata: message.captureMetadata,
    title: message.title ?? '',
    body: message.body ?? '',
  };
}

export function buildPendingCapture(
  message: ScenarioSaveCaptureStepMessage
): PendingScenarioCaptureInput {
  const saveFields = buildScenarioCaptureSaveFields(message);

  return {
    id: crypto.randomUUID(),
    filename: message.filename,
    ...saveFields,
    captureMetadata: saveFields.captureMetadata ?? createDefaultCaptureMetadata(),
  };
}

export function buildScenarioCaptureSaveArgs(
  args: { projectId: string } & ScenarioCaptureSaveFields
) {
  return {
    projectId: args.projectId,
    dataUrl: args.dataUrl,
    ...(args.galleryAssetId !== null ? { galleryAssetId: args.galleryAssetId } : {}),
    captureSurface: args.captureSurface,
    sourceKind: args.sourceKind,
    page: args.page,
    ...(args.target !== null ? { target: args.target } : {}),
    ...(args.interactionPoint !== null ? { interactionPoint: args.interactionPoint } : {}),
    ...(args.cursorPoint !== null ? { cursorPoint: args.cursorPoint } : {}),
    ...(args.captureMetadata !== undefined ? { captureMetadata: args.captureMetadata } : {}),
    ...(args.title !== '' ? { title: args.title } : {}),
    ...(args.body !== '' ? { body: args.body } : {}),
  };
}

export function saveScenarioCaptureForProject(projectId: string, args: ScenarioCaptureSaveFields) {
  return saveScenarioCaptureSlideToProject(
    buildScenarioCaptureSaveArgs({
      projectId,
      ...args,
    })
  );
}

export async function buildScenarioSessionPayload(
  tabId: number,
  scenarioSessionService: ScenarioSessionService
) {
  const [session, surface, projects] = await Promise.all([
    scenarioSessionService.getSession(tabId),
    scenarioSessionService.getSurface(tabId),
    listScenarioProjectSummariesV3(),
  ]);
  const activeProject = session.projectId
    ? (projects.find((project) => project.id === session.projectId) ?? null)
    : null;
  const projectRevision = scenarioSessionService.syncProjectRevision(tabId, {
    hasActiveProject: activeProject !== null,
  });
  const { recentSteps, trashedSteps } = await buildScenarioProjectStepPayload(
    activeProject?.id ?? null
  );

  return {
    session,
    surface,
    projects,
    projectRevision,
    recentSteps,
    trashedSteps,
    snapshot: {
      session,
      surface,
      projectRevision,
    },
  };
}

export async function resolveProjectSelection(projectId: string | null): Promise<{
  id: string | null;
  name: string | null;
}> {
  if (!projectId) {
    return { id: null, name: null };
  }

  const project = await getScenarioProjectRecordV3(projectId);
  if (!project) {
    throw new Error(`Scenario project not found: ${projectId}`);
  }

  return {
    id: project.id,
    name: project.name,
  };
}

export async function flushPendingCaptureIfNeeded(
  tabId: number,
  projectId: string,
  scenarioSessionService: ScenarioSessionService
): Promise<{
  stepId?: string;
}> {
  const pendingCapture = await scenarioSessionService.resolvePendingCapture(tabId);
  if (!pendingCapture) {
    return {};
  }

  const result = await saveScenarioCaptureForProject(projectId, {
    dataUrl: pendingCapture.dataUrl,
    galleryAssetId: pendingCapture.galleryAssetId,
    captureSurface: pendingCapture.captureSurface,
    sourceKind: pendingCapture.sourceKind,
    page: pendingCapture.page,
    target: pendingCapture.target,
    interactionPoint: pendingCapture.interactionPoint,
    cursorPoint: pendingCapture.cursorPoint,
    captureMetadata: pendingCapture.captureMetadata,
    title: pendingCapture.title,
    body: pendingCapture.body,
  });

  await scenarioSessionService.clearPendingCaptureIfCurrent(tabId, pendingCapture);

  return {
    stepId: result.slide.id,
  };
}
