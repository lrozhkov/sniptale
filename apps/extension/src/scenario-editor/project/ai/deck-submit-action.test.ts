import { beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { translate } from '../../../platform/i18n';
import { listBundledScenarioTemplates } from '../../../features/scenario/project/v3/templates';
import type { ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';
import { createScenarioEditorDeckAiSubmitAction } from './deck-submit-action';
import type { ScenarioAiClient } from './client';
import type { ScenarioEditorDeckAiState } from './deck-state';

let aiClient: ScenarioAiClient;
let requestResponse: ReturnType<typeof vi.fn<ScenarioAiClient['requestResponse']>>;

beforeEach(() => {
  vi.clearAllMocks();
  requestResponse = vi.fn<ScenarioAiClient['requestResponse']>();
  aiClient = { requestResponse };
  requestResponse.mockResolvedValue({
    operations: [{ slideId: 'slide-1', title: 'AI title', type: 'setSlideTitle' }],
    success: true,
  });
});

it('ignores empty deck AI instructions', async () => {
  const aiState = createAiState('   ');

  await createScenarioEditorDeckAiSubmitAction({
    aiState,
    applyProject: vi.fn(),
    client: aiClient,
    project: createProject(),
    selectedSlideId: 'slide-1',
    templates: listBundledScenarioTemplates(),
  })();

  expect(requestResponse).not.toHaveBeenCalled();
  expect(aiState.setLoading).not.toHaveBeenCalled();
});

it('submits v3 payloads through runtime messaging and commits valid operation batches', async () => {
  const applyProject = vi.fn();
  const aiState = createAiState('Update title');

  await createScenarioEditorDeckAiSubmitAction({
    aiState,
    applyProject,
    client: aiClient,
    project: createProject(),
    selectedSlideId: 'slide-1',
    templates: listBundledScenarioTemplates(),
  })();

  expect(requestResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      projectOutlineJson: expect.any(String),
      selectedSlideCodeJson: expect.any(String),
    })
  );
  expect(applyProject).toHaveBeenCalledWith(
    expect.objectContaining({ slides: [expect.objectContaining({ title: 'AI title' })] })
  );
  expect(aiState.setLastRunSummary).toHaveBeenCalledWith(
    expect.objectContaining({ selectedSlideId: 'slide-1' })
  );
  expect(aiState.setLoading).toHaveBeenLastCalledWith(false);
});

it('surfaces invalid responses without committing a partial project', async () => {
  const applyProject = vi.fn();
  const aiState = createAiState('Use missing slide');
  requestResponse.mockResolvedValueOnce({
    operations: [{ slideId: 'missing', title: 'Nope', type: 'setSlideTitle' }],
    success: true,
  });

  await createScenarioEditorDeckAiSubmitAction({
    aiState,
    applyProject,
    client: aiClient,
    project: createProject(),
    selectedSlideId: 'slide-1',
    templates: listBundledScenarioTemplates(),
  })();

  expect(applyProject).not.toHaveBeenCalled();
  expect(aiState.setError).toHaveBeenLastCalledWith(
    expect.stringContaining('Unknown slide id: missing')
  );
});

it('drops stale deck AI responses after the editor project changes', async () => {
  const response = createDeferred<ProcessScenarioEditorWithLLMResponse>();
  const applyProject = vi.fn();
  const aiState = createAiState('Update title');
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

  currentProject = { ...baseProject, updatedAt: baseProject.updatedAt + 1 };
  response.resolve({
    operations: [{ slideId: 'slide-1', title: 'Stale title', type: 'setSlideTitle' }],
    success: true,
  });
  await actionPromise;

  expect(applyProject).not.toHaveBeenCalled();
  expect(aiState.setLastRunSummary).not.toHaveBeenCalled();
  expect(aiState.setLoading).toHaveBeenLastCalledWith(false);
});

it('surfaces provider failures without applying a project', async () => {
  const applyProject = vi.fn();
  const aiState = createAiState('Try provider');
  requestResponse.mockResolvedValueOnce({
    error: 'provider failed',
    success: false,
  });

  await createScenarioEditorDeckAiSubmitAction({
    aiState,
    applyProject,
    client: aiClient,
    project: createProject(),
    selectedSlideId: 'slide-1',
    templates: listBundledScenarioTemplates(),
  })();

  expect(applyProject).not.toHaveBeenCalled();
  expect(aiState.setError).toHaveBeenLastCalledWith('provider failed');
});

it('rejects successful responses that omit v3 operations', async () => {
  const applyProject = vi.fn();
  const aiState = createAiState('Missing operations');
  requestResponse.mockResolvedValueOnce({ success: true });

  await createScenarioEditorDeckAiSubmitAction({
    aiState,
    applyProject,
    client: aiClient,
    project: createProject(),
    selectedSlideId: 'slide-1',
    templates: listBundledScenarioTemplates(),
  })();

  expect(applyProject).not.toHaveBeenCalled();
  expect(aiState.setError).toHaveBeenLastCalledWith(
    translate('scenario.editor.aiEditorInvalidResponse')
  );
});

it('surfaces unknown request failures through the generic deck AI error label', async () => {
  const applyProject = vi.fn();
  const aiState = createAiState('Throw non-error');
  requestResponse.mockRejectedValueOnce('network failed');

  await createScenarioEditorDeckAiSubmitAction({
    aiState,
    applyProject,
    client: aiClient,
    project: createProject(),
    selectedSlideId: 'slide-1',
    templates: listBundledScenarioTemplates(),
  })();

  expect(applyProject).not.toHaveBeenCalled();
  expect(aiState.setError).toHaveBeenLastCalledWith(
    translate('scenario.editor.aiEditorRequestFailed')
  );
});

function createProject() {
  const project = createScenarioProjectV3('AI deck');
  return { ...project, slides: [{ ...project.slides[0]!, id: 'slide-1' }] };
}

function createAiState(instruction: string): ScenarioEditorDeckAiState {
  return {
    availableModels: [],
    error: null,
    instruction,
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
