import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
  ScenarioEditorAppliedPatch,
} from '../../../contracts/ai/scenario';
import { getScenarioAssetEntry } from '../../../composition/persistence/scenario/store/public';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import { buildScenarioEditorLLMPayload } from './attachments';
import { createScenarioAiClient, type ScenarioAiClient } from './client';
import { applyScenarioEditorAIResponse } from './response-apply/response/apply';
import type { ScenarioEditorAiAttachmentDisclosure, ScenarioEditorAiRunSummary } from './types';
import { getScenarioMutationTimestamp } from '../mutation/timestamps';
import type { ScenarioEditorAiState } from './use-state';

async function loadScenarioProjectAssets(project: ScenarioProject) {
  const entries = await Promise.all(
    project.steps.map(async (step) => {
      if (step.kind !== 'capture') {
        return null;
      }

      const assetEntry = await getScenarioAssetEntry(step.assetId);
      return assetEntry ? ([step.assetId, assetEntry] as const) : null;
    })
  );

  return new Map<string, ScenarioAssetEntry>(
    entries.filter((entry): entry is readonly [string, ScenarioAssetEntry] => entry !== null)
  );
}

function createScenarioEditorRunSummary(
  instruction: string,
  response: ProcessScenarioEditorWithLLMResponse,
  appliedPatches: ScenarioEditorAppliedPatch[]
): ScenarioEditorAiRunSummary {
  return {
    appliedStepIds: appliedPatches.map((item) => item.stepId),
    instruction,
    requestedStepIds: response.steps?.map((item) => item.stepId) ?? [],
    submittedAt: getScenarioMutationTimestamp(),
  };
}

async function requestScenarioEditorAiResponse(args: {
  attachments: ProcessScenarioEditorWithLLMMessage['attachments'];
  client: ScenarioAiClient;
  instruction: string;
  modelId: string | null;
  projectSnapshotJson: string;
}): Promise<ProcessScenarioEditorWithLLMResponse> {
  return args.client.requestResponse({
    attachments: args.attachments,
    instruction: args.instruction,
    modelId: args.modelId,
    projectSnapshotJson: args.projectSnapshotJson,
  });
}

async function prepareScenarioEditorAiRequest(args: {
  aiState: ScenarioEditorAiState;
  project: ScenarioProject;
  selectedStepId?: string | null;
}) {
  const [payload, assetsById] = await Promise.all([
    buildScenarioEditorLLMPayload({
      attachmentMode: args.aiState.attachmentMode,
      project: args.project,
      selectedStepId: args.selectedStepId ?? null,
    }),
    loadScenarioProjectAssets(args.project),
  ]);

  return { assetsById, payload };
}

async function runScenarioEditorAiSubmit(args: {
  applyStepPatches: (patches: ScenarioEditorAppliedPatch[]) => void;
  getCurrentProject: (() => ScenarioProject | null) | undefined;
  project: ScenarioProject;
  selectedStepId: string | null;
  aiState: ScenarioEditorAiState;
  client: ScenarioAiClient;
}) {
  const { assetsById, payload } = await prepareScenarioEditorAiRequest(args);
  const response = await requestScenarioEditorAiResponse({
    attachments: payload.attachments,
    client: args.client,
    instruction: args.aiState.instruction,
    modelId: args.aiState.selectedModelId,
    projectSnapshotJson: payload.projectSnapshotJson,
  });

  if (isStaleScenarioAiBaseProject(args)) {
    return;
  }

  applyScenarioAiResponseResult({
    aiState: args.aiState,
    applyStepPatches: args.applyStepPatches,
    assetsById,
    project: args.project,
    response,
  });
}

function createScenarioAiAttachmentDisclosure(args: {
  aiState: ScenarioEditorAiState;
  project: ScenarioProject;
  selectedStepId: string | null;
}): ScenarioEditorAiAttachmentDisclosure {
  const selectedStep = args.project.steps.find((step) => step.id === args.selectedStepId);
  return {
    mode: args.aiState.attachmentMode,
    screenshotCount:
      args.aiState.attachmentMode === 'current' && selectedStep?.kind === 'capture' ? 1 : 0,
    selectedStepId: args.selectedStepId,
  };
}

export function createScenarioEditorAiSubmitAction(args: {
  aiState: ScenarioEditorAiState;
  applyStepPatches: (patches: ScenarioEditorAppliedPatch[]) => void;
  getCurrentProject?: () => ScenarioProject | null;
  client?: ScenarioAiClient;
  project: ScenarioProject | null;
  selectedStepId?: string | null;
}) {
  const client = args.client ?? createScenarioAiClient();

  return async () => {
    const project = args.project;
    if (!project || !args.aiState.instruction.trim()) {
      return;
    }

    const selectedStepId = args.selectedStepId ?? null;
    args.aiState.setActiveAttachmentDisclosure(
      createScenarioAiAttachmentDisclosure({
        aiState: args.aiState,
        project,
        selectedStepId,
      })
    );
    args.aiState.setLoading(true);
    args.aiState.setError(null);

    try {
      await runScenarioEditorAiSubmit({
        aiState: args.aiState,
        applyStepPatches: args.applyStepPatches,
        client,
        getCurrentProject: args.getCurrentProject,
        project,
        selectedStepId,
      });
    } catch (error) {
      args.aiState.setError(error instanceof Error ? error.message : 'Scenario AI request failed');
    } finally {
      args.aiState.setLoading(false);
      args.aiState.setActiveAttachmentDisclosure(null);
    }
  };
}

function applyScenarioAiResponseResult(args: {
  aiState: ScenarioEditorAiState;
  applyStepPatches: (patches: ScenarioEditorAppliedPatch[]) => void;
  assetsById: Map<string, ScenarioAssetEntry>;
  project: ScenarioProject;
  response: ProcessScenarioEditorWithLLMResponse;
}): void {
  if (!args.response.success) {
    throw new Error(args.response.error ?? 'Scenario AI request failed');
  }

  const appliedPatches = applyScenarioEditorAIResponse({
    assetsById: args.assetsById,
    project: args.project,
    steps: args.response.steps ?? [],
  });

  args.applyStepPatches(appliedPatches);
  args.aiState.setLastRunSummary(
    createScenarioEditorRunSummary(args.aiState.instruction, args.response, appliedPatches)
  );
}

function isStaleScenarioAiBaseProject(args: {
  getCurrentProject?: (() => ScenarioProject | null) | undefined;
  project: ScenarioProject;
}): boolean {
  const currentProject = args.getCurrentProject?.() ?? args.project;
  return (
    !currentProject || currentProject.id !== args.project.id || currentProject !== args.project
  );
}
