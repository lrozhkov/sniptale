import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';
import { listBundledScenarioTemplates } from '../../../features/scenario/project/v3/templates';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { createScenarioEditorDeckAiSubmitAction } from './deck-submit-action';
import type { ScenarioAiClient } from './client';
import type { ScenarioEditorDeckAiState } from './deck-state';

let aiClient: ScenarioAiClient;
let requestResponse: ReturnType<typeof vi.fn<ScenarioAiClient['requestResponse']>>;

function createProject() {
  const project = createScenarioProjectV3('AI deck');
  return { ...project, slides: [{ ...project.slides[0]!, id: 'slide-1' }] };
}

function createAiState(): ScenarioEditorDeckAiState {
  return {
    availableModels: [],
    error: null,
    instruction: 'Update title',
    lastRunSummary: null,
    loading: false,
    providers: [],
    selectedModelId: 'model-1',
    setError: vi.fn(),
    setInstruction: vi.fn(),
    setLastRunSummary: vi.fn(),
    setLoading: vi.fn(),
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
  requestResponse = vi.fn<ScenarioAiClient['requestResponse']>();
  aiClient = { requestResponse };
});

it('drops stale deck AI responses when the project changes without an updatedAt bump', async () => {
  const response = createDeferred<ProcessScenarioEditorWithLLMResponse>();
  const applyProject = vi.fn();
  const aiState = createAiState();
  const baseProject = createProject();
  let currentProject = baseProject;
  requestResponse.mockReturnValueOnce(response.promise);

  const actionPromise = createScenarioEditorDeckAiSubmitAction({
    aiState,
    applyProject,
    client: aiClient,
    getCurrentProject: () => currentProject,
    project: baseProject,
    selectedSlideId: 'slide-1',
    templates: listBundledScenarioTemplates(),
  })();

  currentProject = {
    ...baseProject,
    name: 'Changed without timestamp bump',
    updatedAt: baseProject.updatedAt,
  };
  response.resolve({
    operations: [{ slideId: 'slide-1', title: 'Stale title', type: 'setSlideTitle' }],
    success: true,
  });
  await actionPromise;

  expect(applyProject).not.toHaveBeenCalled();
  expect(aiState.setLastRunSummary).not.toHaveBeenCalled();
  expect(aiState.setLoading).toHaveBeenLastCalledWith(false);
});
