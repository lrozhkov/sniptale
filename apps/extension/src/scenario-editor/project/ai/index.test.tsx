// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessScenarioEditorWithLLMResponse } from '../../../contracts/ai/scenario';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioProject,
} from '../../../features/scenario/project/public';
import type { ScenarioAiClient } from './client';

const mocks = vi.hoisted(() => ({
  applyScenarioEditorAIResponseMock: vi.fn(),
  buildScenarioEditorLLMPayloadMock: vi.fn(),
  getScenarioAssetEntryMock: vi.fn(),
  requestAIModelSelectionBootstrapMock: vi.fn(),
}));

vi.mock('../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: mocks.requestAIModelSelectionBootstrapMock,
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

vi.mock('./response-apply/response/apply', () => ({
  applyScenarioEditorAIResponse: mocks.applyScenarioEditorAIResponseMock,
}));

import { createScenarioEditorAiSubmitAction } from './submit-action';
import { useScenarioEditorAiState } from './use-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useScenarioEditorAiState> | null = null;
let aiClient: ScenarioAiClient;
let requestResponse: ReturnType<typeof vi.fn<ScenarioAiClient['requestResponse']>>;

function renderHookHarness() {
  function Harness() {
    latestState = useScenarioEditorAiState();
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestState = null;
  mocks.applyScenarioEditorAIResponseMock.mockReset();
  mocks.buildScenarioEditorLLMPayloadMock.mockReset();
  mocks.getScenarioAssetEntryMock.mockReset();
  mocks.requestAIModelSelectionBootstrapMock.mockReset();
  requestResponse = vi.fn<ScenarioAiClient['requestResponse']>();
  aiClient = { requestResponse };
  mocks.requestAIModelSelectionBootstrapMock.mockResolvedValue({
    chromeAiEnabled: false,
    defaultModelId: null,
    globalSystemPrompt: '',
    models: [],
    providers: [],
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function verifiesScenarioAiSubmit() {
  const applyStepPatches = vi.fn();
  const project = createProject();

  primeSuccessfulScenarioAiRequest();
  renderHookHarness();
  act(() => {
    latestState?.setAttachmentMode('none');
    latestState?.setInstruction('Update the scenario');
    latestState?.setSelectedModelId('model-1');
  });

  const submit = createScenarioEditorAiSubmitAction({
    aiState: latestState!,
    applyStepPatches,
    client: aiClient,
    project,
    selectedStepId: 'step-1',
  });

  await act(async () => {
    await submit();
  });

  expect(applyStepPatches).toHaveBeenCalledWith([{ stepId: 'step-1' }]);
  expect(mocks.buildScenarioEditorLLMPayloadMock).toHaveBeenCalledWith({
    attachmentMode: 'none',
    project,
    selectedStepId: 'step-1',
  });
  expect(latestState?.lastRunSummary).toEqual(
    expect.objectContaining({
      appliedStepIds: ['step-1'],
      instruction: 'Update the scenario',
      requestedStepIds: ['step-1'],
    })
  );

  mockLlmRuntimeResponse({ error: 'request failed', success: false });

  await act(async () => {
    await submit();
  });

  expect(latestState?.error).toBe('request failed');
  expect(latestState?.loading).toBe(false);
}

async function verifiesStaleScenarioAiSubmitIsIgnored() {
  const applyStepPatches = vi.fn();
  const project = createProject();
  let currentProject = project;
  const response = createDeferred<ProcessScenarioEditorWithLLMResponse>();
  primeSuccessfulScenarioAiRequest();
  requestResponse.mockReturnValueOnce(response.promise);
  renderHookHarness();
  act(() => {
    latestState?.setInstruction('Update the scenario');
  });

  const submitPromise = createScenarioEditorAiSubmitAction({
    aiState: latestState!,
    applyStepPatches,
    client: aiClient,
    getCurrentProject: () => currentProject,
    project,
  })();

  currentProject = { ...project, updatedAt: 11 };
  response.resolve({ success: true, steps: [{ stepId: 'step-1' }] });
  await act(async () => {
    await submitPromise;
  });

  expect(applyStepPatches).not.toHaveBeenCalled();
  expect(latestState?.lastRunSummary).toBeNull();
  expect(latestState?.loading).toBe(false);
}

function primeSuccessfulScenarioAiRequest() {
  mocks.getScenarioAssetEntryMock.mockResolvedValue({ assetId: 'asset-1' });
  mocks.buildScenarioEditorLLMPayloadMock.mockResolvedValue({
    attachments: [
      {
        dataUrl: 'data:image/png;base64,AA==',
        filename: 'step-1.png',
        mimeType: 'image/png',
        stepId: 'step-1',
        stepNumber: 1,
      },
    ],
    projectSnapshotJson: '{"project":true}',
  });
  mockLlmRuntimeResponse({ success: true, steps: [{ stepId: 'step-1' }] });
  mocks.applyScenarioEditorAIResponseMock.mockReturnValue([{ stepId: 'step-1' }]);
}

function mockLlmRuntimeResponse(response: ProcessScenarioEditorWithLLMResponse) {
  requestResponse.mockResolvedValue(response);
}

describe('scenario editor AI', () => {
  it('submits AI requests, applies patches, and records errors', verifiesScenarioAiSubmit);
  it(
    'drops stale AI responses after the scenario project changes',
    verifiesStaleScenarioAiSubmitIsIgnored
  );
});
