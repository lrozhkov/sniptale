// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const aiBootstrapMock = vi.hoisted(() => ({
  requestAIModelSelectionBootstrap: vi.fn(),
}));

vi.mock('../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/ai-settings/query')>()),
  requestAIModelSelectionBootstrap: aiBootstrapMock.requestAIModelSelectionBootstrap,
}));

import { useScenarioEditorAiState } from './use-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useScenarioEditorAiState> | null = null;

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

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestState = null;
  aiBootstrapMock.requestAIModelSelectionBootstrap.mockReset();
  aiBootstrapMock.requestAIModelSelectionBootstrap.mockResolvedValue({
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

it('loads bootstrap state and surfaces bootstrap failures', async () => {
  aiBootstrapMock.requestAIModelSelectionBootstrap.mockResolvedValueOnce({
    chromeAiEnabled: false,
    defaultModelId: 'model-1',
    globalSystemPrompt: '',
    models: [{ id: 'model-1', label: 'Model 1' }],
    providers: [
      {
        connectionType: 'openai-compatible',
        createdAt: 1,
        destinationKind: 'external',
        hasStoredApiKey: true,
        id: 'provider-1',
        name: 'Provider 1',
      },
    ],
  });

  renderHookHarness();
  await flushMicrotasks();

  expect(latestState?.attachmentMode).toBe('none');
  expect(latestState?.selectedModelId).toBe('model-1');
  expect(latestState?.availableModels).toHaveLength(1);
  expect(latestState?.providers).toHaveLength(1);

  aiBootstrapMock.requestAIModelSelectionBootstrap.mockRejectedValueOnce(
    new Error('bootstrap failed')
  );
  renderHookHarness();
  await flushMicrotasks();

  expect(latestState?.error).toBe('bootstrap failed');
});

it('ignores late bootstrap results after the AI state hook unmounts', async () => {
  let resolveBootstrap:
    | ((value: {
        chromeAiEnabled: boolean;
        defaultModelId: string | null;
        globalSystemPrompt: string;
        models: unknown[];
        providers: unknown[];
      }) => void)
    | null = null;

  aiBootstrapMock.requestAIModelSelectionBootstrap.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveBootstrap = resolve;
      })
  );

  renderHookHarness();

  act(() => root?.unmount());
  root = null;

  await act(async () => {
    resolveBootstrap?.({
      chromeAiEnabled: false,
      defaultModelId: 'late-model',
      globalSystemPrompt: '',
      models: [{ id: 'late-model', label: 'Late model' }],
      providers: [],
    });
    await Promise.resolve();
  });

  expect(container?.innerHTML).toBe('');
});
