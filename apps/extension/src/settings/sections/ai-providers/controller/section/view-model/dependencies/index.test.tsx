import { beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../../../../../contracts/settings';
import { useAiProvidersSectionControllerDependencies } from '.';

const dependencyMocks = vi.hoisted(() => ({
  buildAiProvidersModelOptionsMock: vi.fn(),
  saveAiProvidersDefaultModelMock: vi.fn(),
  useAiProvidersChromeAiStateMock: vi.fn(),
  useAiProvidersDataStateMock: vi.fn(),
  useAiProvidersDeleteHandlersMock: vi.fn(),
  useAiProvidersProviderSecretActionsMock: vi.fn(),
  useAiProvidersSecretProtectionStateMock: vi.fn(),
  useAiSecretProtectionDataStateMock: vi.fn(),
  useAiProvidersLoaderMock: vi.fn(),
  useAiProvidersModalStateMock: vi.fn(),
  useAiProvidersPromptStateMock: vi.fn(),
}));

vi.mock('../../../model-options', () => ({
  buildAiProvidersModelOptions: dependencyMocks.buildAiProvidersModelOptionsMock,
}));

vi.mock('../../../save', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../save')>()),
  saveAiProvidersDefaultModel: dependencyMocks.saveAiProvidersDefaultModelMock,
}));

vi.mock('../../../state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state')>()),
  useAiProvidersDataState: dependencyMocks.useAiProvidersDataStateMock,
  useAiSecretProtectionDataState: dependencyMocks.useAiSecretProtectionDataStateMock,
  useAiProvidersLoader: dependencyMocks.useAiProvidersLoaderMock,
}));

vi.mock('../../../chrome-ai', () => ({
  useAiProvidersChromeAiState: dependencyMocks.useAiProvidersChromeAiStateMock,
}));

vi.mock('../../delete-handlers', () => ({
  useAiProvidersDeleteHandlers: dependencyMocks.useAiProvidersDeleteHandlersMock,
}));

vi.mock('../../provider-secret-actions', () => ({
  useAiProvidersProviderSecretActions: dependencyMocks.useAiProvidersProviderSecretActionsMock,
}));

vi.mock('../../modal-state', () => ({
  useAiProvidersModalState: dependencyMocks.useAiProvidersModalStateMock,
}));

vi.mock('../../prompt-state/build', () => ({
  useAiProvidersPromptState: dependencyMocks.useAiProvidersPromptStateMock,
}));

vi.mock('../../secret-protection', () => ({
  useAiProvidersSecretProtectionState: dependencyMocks.useAiProvidersSecretProtectionStateMock,
}));

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: '',
};

function createDataState() {
  return {
    chromeAiEnabled: false,
    providers: [PROVIDER],
    models: [MODEL],
    defaultModelId: 'model-1',
    globalPrompt: 'Global prompt',
    globalPromptRef: { current: null },
    isLoading: false,
    scenarioEditorPrompt: 'Scenario prompt',
    scenarioEditorPromptRef: { current: null },
    selection: { models: [MODEL], providers: [PROVIDER] },
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

function createSecretProtectionDataState() {
  return {
    secretProtectionStatus: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
    setSecretProtectionStatus: vi.fn(),
  };
}

function mockRuntimeState(
  dataState: ReturnType<typeof createDataState>,
  secretProtectionDataState: ReturnType<typeof createSecretProtectionDataState>
) {
  const reloadData = vi.fn().mockResolvedValue(undefined);
  dependencyMocks.useAiProvidersDataStateMock.mockReturnValue(dataState);
  dependencyMocks.useAiSecretProtectionDataStateMock.mockReturnValue(secretProtectionDataState);
  dependencyMocks.useAiProvidersLoaderMock.mockReturnValue({ reloadData });
}

function mockModalState() {
  const openModal = vi.fn();
  const closeModal = vi.fn();
  dependencyMocks.useAiProvidersModalStateMock.mockReturnValue({
    closeModelModal: closeModal,
    closeProviderModal: closeModal,
    confirmDelete: null,
    modelModal: { open: false },
    openModelModal: openModal,
    openProviderModal: openModal,
    providerModal: { open: false },
    setConfirmDelete: vi.fn(),
  });
}

function mockPromptState(dataState: ReturnType<typeof createDataState>) {
  const promptSave = vi.fn().mockResolvedValue(undefined);
  const promptResize = vi.fn();
  dependencyMocks.useAiProvidersPromptStateMock.mockReturnValue({
    global: {
      handleResizeStart: promptResize,
      handleSave: promptSave,
      setValue: dataState.setGlobalPromptState,
      textareaRef: { current: null },
      value: dataState.globalPrompt,
    },
    scenarioEditor: {
      handleResizeStart: promptResize,
      handleSave: promptSave,
      setValue: dataState.setScenarioEditorPromptState,
      textareaRef: { current: null },
      value: dataState.scenarioEditorPrompt,
    },
  });
}

function mockDeleteHandlers() {
  const deleteHandler = vi.fn();
  dependencyMocks.useAiProvidersDeleteHandlersMock.mockReturnValue({
    handleDeleteModel: deleteHandler,
    handleDeleteProvider: deleteHandler,
  });
}

function mockProviderSecretActions() {
  dependencyMocks.useAiProvidersProviderSecretActionsMock.mockReturnValue({
    handleClearProviderSecret: vi.fn().mockResolvedValue(undefined),
  });
}

function mockChromeAiState() {
  dependencyMocks.useAiProvidersChromeAiStateMock.mockReturnValue({
    availability: 'available',
    enabled: false,
    error: null,
    handleToggle: vi.fn(),
    isChecking: false,
    isSettingUp: false,
    setupProgress: null,
  });
}

function mockSecretProtectionState() {
  dependencyMocks.useAiProvidersSecretProtectionStateMock.mockReturnValue({
    dialog: null,
    status: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
  });
}

function mockModelOptions() {
  dependencyMocks.buildAiProvidersModelOptionsMock.mockReturnValue([
    { value: '', label: 'Unset' },
    { value: 'model-1', label: 'OpenAI / GPT 4.1' },
  ]);
  dependencyMocks.saveAiProvidersDefaultModelMock.mockResolvedValue(undefined);
}

function mockDependencies() {
  const dataState = createDataState();
  const secretProtectionDataState = createSecretProtectionDataState();
  mockRuntimeState(dataState, secretProtectionDataState);
  mockModalState();
  mockPromptState(dataState);
  mockDeleteHandlers();
  mockProviderSecretActions();
  mockChromeAiState();
  mockSecretProtectionState();
  mockModelOptions();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDependencies();
});

function expectControllerDependencyShape(
  deps: ReturnType<typeof useAiProvidersSectionControllerDependencies>
) {
  expect(deps).toMatchObject({
    chromeAi: {
      availability: 'available',
      enabled: false,
    },
    secretProtection: {
      status: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
    },
    dataState: {
      defaultModelId: 'model-1',
      isLoading: false,
      providers: [PROVIDER],
      models: [MODEL],
    },
    modalState: {
      confirmDelete: null,
      model: { open: false },
      provider: { open: false },
    },
  });
  expect(deps.getProviderName('provider-1')).toBe('OpenAI');
  expect(deps.getProviderName('missing')).toBe('Unknown');
}

function expectOwnerHookCalls() {
  expect(dependencyMocks.useAiProvidersLoaderMock).toHaveBeenCalledWith(
    dependencyMocks.useAiProvidersDataStateMock.mock.results[0]?.value,
    dependencyMocks.useAiSecretProtectionDataStateMock.mock.results[0]?.value
  );
  expect(dependencyMocks.useAiProvidersChromeAiStateMock).toHaveBeenCalledWith({
    chromeAiEnabled: false,
    defaultModelId: 'model-1',
    models: [MODEL],
    reloadData: expect.any(Function),
    setChromeAiEnabled: expect.any(Function),
    setDefaultModelId: expect.any(Function),
  });
  expect(dependencyMocks.useAiProvidersModalStateMock).toHaveBeenCalled();
  expect(dependencyMocks.useAiProvidersPromptStateMock).toHaveBeenCalledWith(
    dependencyMocks.useAiProvidersDataStateMock.mock.results[0]?.value
  );
  expect(dependencyMocks.useAiProvidersDeleteHandlersMock).toHaveBeenCalledWith({
    confirmDelete: null,
    reloadData: expect.any(Function),
    setConfirmDelete: expect.any(Function),
  });
  expect(dependencyMocks.useAiProvidersProviderSecretActionsMock).toHaveBeenCalledWith({
    reloadData: expect.any(Function),
  });
  expect(dependencyMocks.useAiProvidersSecretProtectionStateMock).toHaveBeenCalledWith({
    reloadData: expect.any(Function),
    status: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
  });
}

it('builds the controller dependencies from owner-local hooks', () => {
  const deps = useAiProvidersSectionControllerDependencies();

  expectControllerDependencyShape(deps);
  expectOwnerHookCalls();
});

it('normalizes an empty default-model value to null before saving', async () => {
  const deps = useAiProvidersSectionControllerDependencies();

  await deps.handleDefaultModelChange('');

  expect(dependencyMocks.saveAiProvidersDefaultModelMock).toHaveBeenCalledWith(
    null,
    expect.any(Function)
  );
});
