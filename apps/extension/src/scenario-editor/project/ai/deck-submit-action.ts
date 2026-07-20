import type { ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';
import { translate } from '../../../platform/i18n';
import type { ScenarioAiOperation } from '@sniptale/runtime-contracts/scenario-ai-operations';
import { buildScenarioEditorV3LLMPayload } from './deck-payload';
import { createScenarioAiClient, type ScenarioAiClient } from './client';
import { applyScenarioAiOperations } from './operations';
import type {
  ScenarioProjectV3,
  ScenarioTemplateDefinition,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioEditorDeckAiState } from './deck-state';

async function requestScenarioEditorDeckAiResponse(args: {
  client: ScenarioAiClient;
  payload: ReturnType<typeof buildScenarioEditorV3LLMPayload>;
  instruction: string;
  modelId: string | null;
}): Promise<ProcessScenarioEditorWithLLMResponse> {
  return args.client.requestResponse({
    attachments: args.payload.attachments,
    instruction: args.instruction,
    modelId: args.modelId,
    projectOutlineJson: args.payload.projectOutlineJson,
    projectSnapshotJson: args.payload.projectSnapshotJson,
    selectedSlideCodeJson: args.payload.selectedSlideCodeJson,
    toolManifestJson: args.payload.toolManifestJson,
  });
}

export function createScenarioEditorDeckAiSubmitAction(args: {
  aiState: ScenarioEditorDeckAiState;
  applyProject: (project: ScenarioProjectV3) => void;
  getCurrentProject?: () => ScenarioProjectV3;
  client?: ScenarioAiClient;
  project: ScenarioProjectV3;
  selectedSlideId: string;
  templates: readonly ScenarioTemplateDefinition[];
}) {
  const client = args.client ?? createScenarioAiClient();
  return () => submitScenarioEditorDeckAiRequest({ ...args, client });
}

async function submitScenarioEditorDeckAiRequest(args: {
  aiState: ScenarioEditorDeckAiState;
  applyProject: (project: ScenarioProjectV3) => void;
  client: ScenarioAiClient;
  getCurrentProject?: () => ScenarioProjectV3;
  project: ScenarioProjectV3;
  selectedSlideId: string;
  templates: readonly ScenarioTemplateDefinition[];
}) {
  const instruction = args.aiState.instruction.trim();
  if (!instruction) {
    return;
  }

  args.aiState.setLoading(true);
  args.aiState.setError(null);

  try {
    await applyScenarioEditorDeckAiResponse({ ...args, instruction });
  } catch (error) {
    args.aiState.setError(
      error instanceof Error ? error.message : translate('scenario.editor.aiEditorRequestFailed')
    );
  } finally {
    args.aiState.setLoading(false);
  }
}

async function applyScenarioEditorDeckAiResponse(args: {
  aiState: ScenarioEditorDeckAiState;
  applyProject: (project: ScenarioProjectV3) => void;
  client: ScenarioAiClient;
  getCurrentProject?: () => ScenarioProjectV3;
  instruction: string;
  project: ScenarioProjectV3;
  selectedSlideId: string;
  templates: readonly ScenarioTemplateDefinition[];
}) {
  const payload = buildScenarioEditorV3LLMPayload({
    project: args.project,
    selectedSlideId: args.selectedSlideId,
    templates: args.templates,
  });
  const response = await requestScenarioEditorDeckAiResponse({
    client: args.client,
    instruction: args.instruction,
    modelId: args.aiState.selectedModelId,
    payload,
  });
  if (isStaleScenarioDeckAiBaseProject(args)) {
    return;
  }

  const operations = getScenarioEditorDeckAiOperations(response);
  const applied = applyScenarioAiOperations({
    project: args.project,
    response: { operations },
    templates: args.templates,
  });

  if (applied.status === 'rejected') {
    throw new Error(formatScenarioAiOperationFailures(applied.failures));
  }

  args.applyProject(applied.project);
  args.aiState.setLastRunSummary({
    appliedOperations: applied.appliedOperations,
    instruction: args.instruction,
    selectedSlideId: args.selectedSlideId,
    submittedAt: Date.now(),
  });
}

function isStaleScenarioDeckAiBaseProject(args: {
  getCurrentProject?: () => ScenarioProjectV3;
  project: ScenarioProjectV3;
}): boolean {
  const currentProject = args.getCurrentProject?.() ?? args.project;
  return currentProject.id !== args.project.id || currentProject !== args.project;
}

function getScenarioEditorDeckAiOperations(response: ProcessScenarioEditorWithLLMResponse) {
  if (!response.success) {
    throw new Error(response.error ?? translate('scenario.editor.aiEditorRequestFailed'));
  }
  if (!response.operations) {
    throw new Error(translate('scenario.editor.aiEditorInvalidResponse'));
  }

  return response.operations;
}

function formatScenarioAiOperationFailures(
  failures: Array<{ index: number; message: string }>
): string {
  const firstFailure = failures[0];
  if (!firstFailure) {
    return translate('scenario.editor.aiEditorInvalidResponse');
  }

  return `${translate('scenario.editor.aiEditorInvalidResponse')}: ${firstFailure.message}`;
}

export function summarizeScenarioAiOperation(operation: ScenarioAiOperation): string {
  switch (operation.type) {
    case 'setProjectPresentation':
      return translate('scenario.editor.aiOperationProjectPresentation');
    case 'setSlideTitle':
      return translate('scenario.editor.aiOperationSlideTitle');
    case 'setSlideNotes':
      return translate('scenario.editor.aiOperationSlideNotes');
    case 'setSlideCanvas':
      return translate('scenario.editor.aiOperationSlideCanvas');
    case 'setSlideLayout':
    case 'setSlideTemplate':
      return translate('scenario.editor.aiOperationSlideLayout');
    case 'setSlideTransition':
    case 'setSlideBackgroundTransition':
    case 'setSlideClicks':
      return translate('scenario.editor.aiOperationSlidePresentation');
    case 'addElement':
    case 'deleteElement':
    case 'reorderElement':
    case 'updateElement':
      return translate('scenario.editor.aiOperationElement');
    case 'setElementAnimation':
    case 'setElementBuild':
      return translate('scenario.editor.aiOperationElementBuild');
    case 'editImageTransform':
      return translate('scenario.editor.aiOperationImageTransform');
  }
}
