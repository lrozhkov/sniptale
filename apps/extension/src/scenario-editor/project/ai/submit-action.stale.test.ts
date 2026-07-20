// @vitest-environment jsdom

import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioProject,
} from '../../../features/scenario/project/public';
import { createScenarioEditorAiSubmitAction } from './submit-action';
import type { ScenarioAiClient } from './client';

const mocks = vi.hoisted(() => ({
  applyScenarioEditorAIResponseMock: vi.fn(),
  buildScenarioEditorLLMPayloadMock: vi.fn(),
  getScenarioAssetEntryMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  getScenarioAssetEntry: mocks.getScenarioAssetEntryMock,
}));

vi.mock('./attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./attachments')>()),
  buildScenarioEditorLLMPayload: mocks.buildScenarioEditorLLMPayloadMock,
}));

let aiClient: ScenarioAiClient;
let requestResponse: ReturnType<typeof vi.fn<ScenarioAiClient['requestResponse']>>;

vi.mock('./response-apply/response/apply', () => ({
  applyScenarioEditorAIResponse: mocks.applyScenarioEditorAIResponseMock,
}));

function createProject() {
  const project = createScenarioProject('Scenario');
  return {
    ...project,
    id: 'project-1',
    steps: [
      { ...createScenarioCaptureStep({ assetId: 'asset-1' }), id: 'step-1' },
      { ...createScenarioNoteStep({ body: 'Note', title: 'Note' }), id: 'step-2' },
    ],
    updatedAt: 10,
  } satisfies ScenarioProject;
}

function createAiState() {
  return {
    activeAttachmentDisclosure: null,
    attachmentMode: 'none' as const,
    availableModels: [],
    error: null,
    instruction: 'Update the scenario',
    lastRunSummary: null,
    loading: false,
    providers: [],
    selectedModelId: 'model-1',
    setActiveAttachmentDisclosure: vi.fn(),
    setAttachmentMode: vi.fn(),
    setAvailableModels: vi.fn(),
    setError: vi.fn(),
    setInstruction: vi.fn(),
    setLastRunSummary: vi.fn(),
    setLoading: vi.fn(),
    setProviders: vi.fn(),
    setSelectedModelId: vi.fn(),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getScenarioAssetEntryMock.mockResolvedValue({ assetId: 'asset-1' });
  mocks.buildScenarioEditorLLMPayloadMock.mockResolvedValue({
    attachments: [],
    projectSnapshotJson: '{"project":true}',
  });
  requestResponse = vi.fn<ScenarioAiClient['requestResponse']>();
  aiClient = { requestResponse };
  mocks.applyScenarioEditorAIResponseMock.mockReturnValue([]);
});

it('drops stale AI responses when the current project changes without an updatedAt bump', async () => {
  const applyStepPatches = vi.fn();
  const project = createProject();
  let currentProject = project;
  const response = createDeferred<ProcessScenarioEditorWithLLMResponse>();
  requestResponse.mockReturnValueOnce(response.promise);

  const submitPromise = createScenarioEditorAiSubmitAction({
    aiState: createAiState(),
    applyStepPatches,
    client: aiClient,
    getCurrentProject: () => currentProject,
    project,
  })();

  currentProject = {
    ...project,
    name: 'Changed without timestamp bump',
    updatedAt: project.updatedAt,
  };
  response.resolve({ success: true, steps: [{ stepId: 'step-1' }] });
  await act(async () => {
    await submitPromise;
  });

  expect(applyStepPatches).not.toHaveBeenCalled();
  expect(mocks.applyScenarioEditorAIResponseMock).not.toHaveBeenCalled();
});
