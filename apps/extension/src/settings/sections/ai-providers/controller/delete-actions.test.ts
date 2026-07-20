import type { AIModel, AIProvider } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteAIModelMock, deleteAIProviderMock, toastErrorMock, toastSuccessMock } = vi.hoisted(
  () => ({
    deleteAIModelMock: vi.fn(),
    deleteAIProviderMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  })
);

vi.mock('../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/settings-mutations')>()),
  deleteAIModel: deleteAIModelMock,
  deleteAIProvider: deleteAIProviderMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

function createProvider(): AIProvider {
  return {
    id: 'provider-1',
    name: 'Provider',
    connectionType: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    hasStoredApiKey: true,
    createdAt: 1,
  };
}

function createModel(): AIModel {
  return {
    id: 'model-1',
    providerId: 'provider-1',
    modelCode: 'llama3',
    displayName: 'Llama 3',
    systemPrompt: '',
  };
}

function resetDeleteActionMocks() {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  deleteAIModelMock.mockResolvedValue(undefined);
  deleteAIProviderMock.mockResolvedValue(undefined);
}

async function verifyProviderDeleteFlow() {
  const { handleAiProvidersDelete } = await import('./delete-actions');
  const reloadData = vi.fn().mockResolvedValue(undefined);
  const setConfirmDelete = vi.fn();

  await handleAiProvidersDelete({
    confirmDelete: { type: 'provider', item: createProvider() },
    reloadData,
    setConfirmDelete,
  });

  expect(deleteAIProviderMock).toHaveBeenCalledWith('provider-1');
  expect(deleteAIModelMock).not.toHaveBeenCalled();
  expect(reloadData).toHaveBeenCalledTimes(1);
  expect(toastSuccessMock).toHaveBeenCalledWith(translate('settings.aiProviders.providerDeleted'));
  expect(setConfirmDelete).toHaveBeenLastCalledWith(null);
}

async function verifyModelDeleteFlow() {
  const { handleAiProvidersDelete } = await import('./delete-actions');
  const reloadData = vi.fn().mockResolvedValue(undefined);
  const setConfirmDelete = vi.fn();

  await handleAiProvidersDelete({
    confirmDelete: { type: 'model', item: createModel() },
    reloadData,
    setConfirmDelete,
  });

  expect(deleteAIModelMock).toHaveBeenCalledWith('model-1');
  expect(deleteAIProviderMock).not.toHaveBeenCalled();
  expect(reloadData).toHaveBeenCalledTimes(1);
  expect(toastSuccessMock).toHaveBeenCalledWith(translate('settings.aiProviders.modelDeleted'));
  expect(setConfirmDelete).toHaveBeenLastCalledWith(null);
}

async function verifyDeleteFailurePath() {
  const { handleAiProvidersDelete } = await import('./delete-actions');
  const reloadData = vi.fn().mockResolvedValue(undefined);
  const setConfirmDelete = vi.fn();

  deleteAIProviderMock.mockRejectedValue(new Error('provider delete failed'));

  await handleAiProvidersDelete({
    confirmDelete: { type: 'provider', item: createProvider() },
    reloadData,
    setConfirmDelete,
  });

  expect(reloadData).not.toHaveBeenCalled();
  expect(toastErrorMock).toHaveBeenCalledWith(
    `${translate('common.states.error')}${translate('settings.aiProviders.providerDeleteErrorSuffix')}`
  );
  expect(console.error).toHaveBeenCalledWith(
    '[SettingsAiProviders]',
    'Delete provider failed',
    expect.any(Error)
  );
  expect(setConfirmDelete).toHaveBeenLastCalledWith(null);
}

describe('delete-actions', () => {
  beforeEach(resetDeleteActionMocks);

  it('deletes a provider, reloads data, and clears the confirm state', verifyProviderDeleteFlow);
  it(
    'deletes a model through the model branch and clears the confirm state',
    verifyModelDeleteFlow
  );
  it(
    'shows an error toast and still clears the confirm state when deletion fails',
    verifyDeleteFailurePath
  );
});
