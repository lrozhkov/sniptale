// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const loaderMocks = vi.hoisted(() => ({
  loadAiProvidersRuntimeDataMock: vi.fn(),
  applyLoadedAiProvidersRuntimeDataMock: vi.fn(),
  ensureDefaultAiProvidersModelMock: vi.fn(),
  reportAiProvidersLoaderErrorMock: vi.fn(),
}));

vi.mock('./runtime-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime-data')>()),
  loadAiProvidersRuntimeData: loaderMocks.loadAiProvidersRuntimeDataMock,
}));

vi.mock('./apply-loaded-data', () => ({
  applyLoadedAiProvidersRuntimeData: loaderMocks.applyLoadedAiProvidersRuntimeDataMock,
}));

vi.mock('./default-model', () => ({
  ensureDefaultAiProvidersModel: loaderMocks.ensureDefaultAiProvidersModelMock,
}));

vi.mock('./error-handling', () => ({
  reportAiProvidersLoaderError: loaderMocks.reportAiProvidersLoaderErrorMock,
}));

import type { AIModel, AIProvider } from '../../../../../../contracts/settings';
import { useAiProvidersLoader } from './use-loader';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'Ollama local',
  connectionType: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

const MODELS: AIModel[] = [
  {
    id: 'model-1',
    providerId: 'provider-1',
    modelCode: 'llama3.2',
    displayName: 'Llama 3.2',
    systemPrompt: '',
  },
  {
    id: 'model-2',
    providerId: 'provider-1',
    modelCode: 'phi4',
    displayName: 'Phi 4',
    systemPrompt: '',
  },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestReloadData: ReturnType<typeof useAiProvidersLoader> | null = null;

function Harness(props: {
  dataState: Parameters<typeof useAiProvidersLoader>[0];
  secretProtectionState: Parameters<typeof useAiProvidersLoader>[1];
}) {
  latestReloadData = useAiProvidersLoader(props.dataState, props.secretProtectionState);
  return null;
}

async function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

function createLoaderSetters() {
  return {
    setChromeAiEnabled: vi.fn(),
    setDefaultModelId: vi.fn(),
    setGlobalPromptState: vi.fn(),
    setIsLoading: vi.fn(),
    setModels: vi.fn(),
    setProviders: vi.fn(),
    setSelectionState: vi.fn(),
    setScenarioEditorPromptState: vi.fn(),
  };
}

function createSecretProtectionSetters() {
  return { setSecretProtectionStatus: vi.fn() };
}

function renderLoaderHarness(
  dataState: ReturnType<typeof createLoaderSetters>,
  secretProtectionState = createSecretProtectionSetters()
) {
  return render(<Harness dataState={dataState} secretProtectionState={secretProtectionState} />);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loaderMocks.loadAiProvidersRuntimeDataMock.mockReset();
  loaderMocks.applyLoadedAiProvidersRuntimeDataMock.mockReset();
  loaderMocks.ensureDefaultAiProvidersModelMock.mockReset();
  loaderMocks.reportAiProvidersLoaderErrorMock.mockReset();
  loaderMocks.loadAiProvidersRuntimeDataMock.mockResolvedValue([
    [PROVIDER],
    MODELS,
    [PROVIDER],
    MODELS,
    null,
    'Shared global prompt',
    'Scenario editor prompt',
    false,
    { isEnabled: false, isUnlocked: true, mode: 'transparent' },
  ]);
  loaderMocks.applyLoadedAiProvidersRuntimeDataMock.mockReturnValue({
    loadedDefaultId: null,
    loadedModels: MODELS,
  });
  loaderMocks.ensureDefaultAiProvidersModelMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestReloadData = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('loads runtime data on mount and applies the default-model fallback when needed', async () => {
  const setters = createLoaderSetters();
  const secretSetters = createSecretProtectionSetters();

  await renderLoaderHarness(setters, secretSetters);
  await flushEffects();

  expect(loaderMocks.loadAiProvidersRuntimeDataMock).toHaveBeenCalledTimes(1);
  expect(loaderMocks.applyLoadedAiProvidersRuntimeDataMock).toHaveBeenCalledWith(
    {
      ...setters,
      ...secretSetters,
    },
    [
      [PROVIDER],
      MODELS,
      [PROVIDER],
      MODELS,
      null,
      'Shared global prompt',
      'Scenario editor prompt',
      false,
      { isEnabled: false, isUnlocked: true, mode: 'transparent' },
    ]
  );
  expect(loaderMocks.ensureDefaultAiProvidersModelMock).toHaveBeenCalledWith(
    null,
    MODELS,
    setters.setDefaultModelId
  );
  expect(setters.setIsLoading).toHaveBeenNthCalledWith(1, true);
  expect(setters.setIsLoading).toHaveBeenLastCalledWith(false);
  expect(latestReloadData?.reloadData).toEqual(expect.any(Function));
});

it('reports loader failures through the shared error handler', async () => {
  const setters = createLoaderSetters();
  const loadError = new Error('storage failed');

  loaderMocks.loadAiProvidersRuntimeDataMock.mockRejectedValue(loadError);

  await renderLoaderHarness(setters);
  await flushEffects();

  expect(loaderMocks.reportAiProvidersLoaderErrorMock).toHaveBeenCalledWith(loadError);
  expect(loaderMocks.applyLoadedAiProvidersRuntimeDataMock).not.toHaveBeenCalled();
  expect(loaderMocks.ensureDefaultAiProvidersModelMock).not.toHaveBeenCalled();
  expect(setters.setIsLoading).toHaveBeenNthCalledWith(1, true);
  expect(setters.setIsLoading).toHaveBeenLastCalledWith(false);
});
