import { beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../../../../../../contracts/settings';
import { useAiProvidersSectionControllerDependencies } from '.';

const dependencyMocks = vi.hoisted(() => ({
  buildAiProvidersModelOptionsMock: vi.fn(),
  saveAiProvidersDefaultModelMock: vi.fn(),
  useAiProvidersChromeAiStateMock: vi.fn(),
  useAiProvidersDataStateMock: vi.fn(),
  useAiProvidersDeleteHandlersMock: vi.fn(),
  useAiProvidersProviderSecretActionsMock: vi.fn(),
  useSettingsSecretProtectionMock: vi.fn(),
  sharedEnsureUnlockedMock: vi.fn(),
  useAiProvidersLoaderMock: vi.fn(),
  useAiProvidersModalStateMock: vi.fn(),
}));

vi.mock('../../../model-options', () => ({
  buildAiProvidersModelOptions: dependencyMocks.buildAiProvidersModelOptionsMock,
}));

vi.mock('../../../state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../state')>()),
  useAiProvidersDataState: dependencyMocks.useAiProvidersDataStateMock,
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

vi.mock('../../../../../../../secret-protection/context', () => ({
  useSettingsSecretProtection: dependencyMocks.useSettingsSecretProtectionMock,
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
    isLoading: false,
    selection: { models: [MODEL], providers: [PROVIDER] },
    setChromeAiEnabled: vi.fn(),
    setIsLoading: vi.fn(),
    setModels: vi.fn(),
    setProviders: vi.fn(),
    setSelectionState: vi.fn(),
  };
}

function mockRuntimeState(dataState: ReturnType<typeof createDataState>) {
  const reloadData = vi.fn().mockResolvedValue(undefined);
  dependencyMocks.useAiProvidersDataStateMock.mockReturnValue(dataState);
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
    handleTest: vi.fn(),
    handleToggle: vi.fn(),
    isChecking: false,
    isSettingUp: false,
    setupProgress: null,
    testStatus: 'idle',
  });
}

function mockSecretProtectionState() {
  dependencyMocks.sharedEnsureUnlockedMock.mockResolvedValue(undefined);
  dependencyMocks.useSettingsSecretProtectionMock.mockReturnValue({
    ensureUnlocked: dependencyMocks.sharedEnsureUnlockedMock,
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
  mockRuntimeState(dataState);
  mockModalState();
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
      ensureUnlocked: expect.any(Function),
    },
    dataState: {
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
    dependencyMocks.useAiProvidersDataStateMock.mock.results[0]?.value
  );
  expect(dependencyMocks.useAiProvidersChromeAiStateMock).toHaveBeenCalledWith({
    chromeAiEnabled: false,
    reloadData: expect.any(Function),
    setChromeAiEnabled: expect.any(Function),
  });
  expect(dependencyMocks.useAiProvidersModalStateMock).toHaveBeenCalled();
  expect(dependencyMocks.useAiProvidersDeleteHandlersMock).toHaveBeenCalledWith({
    confirmDelete: null,
    reloadData: expect.any(Function),
    setConfirmDelete: expect.any(Function),
  });
  expect(dependencyMocks.useAiProvidersProviderSecretActionsMock).toHaveBeenCalledWith({
    reloadData: expect.any(Function),
  });
  expect(dependencyMocks.useSettingsSecretProtectionMock).toHaveBeenCalled();
}

it('builds the controller dependencies from owner-local hooks', () => {
  const deps = useAiProvidersSectionControllerDependencies();

  expectControllerDependencyShape(deps);
  expectOwnerHookCalls();
});

it('binds provider secret saves to shared admission for the AI participant', async () => {
  const deps = useAiProvidersSectionControllerDependencies();

  await deps.secretProtection.ensureUnlocked();

  expect(dependencyMocks.sharedEnsureUnlockedMock).toHaveBeenCalledExactlyOnceWith('ai');
});

it('propagates shared unlock cancellation to the existing AI save barrier', async () => {
  const cancelled = new Error('Unlock cancelled');
  dependencyMocks.sharedEnsureUnlockedMock.mockRejectedValueOnce(cancelled);
  const deps = useAiProvidersSectionControllerDependencies();

  await expect(deps.secretProtection.ensureUnlocked()).rejects.toBe(cancelled);
});
