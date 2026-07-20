import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetStateAction } from 'react';

import { translate } from '../../../../platform/i18n';

const { addAIProviderMock, toastSuccessMock, updateAIProviderMock } = vi.hoisted(() => ({
  addAIProviderMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  updateAIProviderMock: vi.fn(),
}));

vi.mock('../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/settings-mutations')>()),
  addAIModel: vi.fn(),
  addAIProvider: addAIProviderMock,
  updateAIModel: vi.fn(),
  updateAIProvider: updateAIProviderMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    child: () => ({
      child: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    }),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: vi.fn(),
    success: toastSuccessMock,
  },
}));

function createStateSetterMock<T>() {
  return vi.fn<(value: SetStateAction<T>) => void>();
}

function resetAiProviderFormSaveMocks() {
  addAIProviderMock.mockReset();
  toastSuccessMock.mockReset();
  updateAIProviderMock.mockReset();
  vi.stubGlobal('crypto', {
    randomUUID: () => 'generated-id',
  });
}

async function verifyProviderValidationErrors() {
  const { saveProviderForm } = await import('./save');
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();

  await saveProviderForm({
    formData: {
      name: '',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      apiKey: '',
    },
    isEditing: false,
    onSave: vi.fn(),
    setErrors,
    setIsSaving,
  });

  expect(setErrors).toHaveBeenCalledWith(expect.objectContaining({ name: expect.any(String) }));
  expect(setIsSaving).not.toHaveBeenCalled();
  expect(addAIProviderMock).not.toHaveBeenCalled();
}

async function verifyProviderCreateFlow() {
  const { saveProviderForm } = await import('./save');
  const onSave = vi.fn();
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();
  const ensureUnlockedBeforeSecretSave = vi.fn().mockResolvedValue(undefined);

  addAIProviderMock.mockResolvedValue(undefined);

  await saveProviderForm({
    formData: {
      name: 'Provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      apiKey: 'secret',
    },
    isEditing: false,
    onSave,
    ensureUnlockedBeforeSecretSave,
    setErrors,
    setIsSaving,
  });

  expect(ensureUnlockedBeforeSecretSave).toHaveBeenCalledTimes(1);
  expect(addAIProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'generated-id',
      name: 'Provider',
      baseUrl: 'https://api.example.com',
      apiKey: 'secret',
    })
  );
  expect(ensureUnlockedBeforeSecretSave.mock.invocationCallOrder[0]).toBeLessThan(
    addAIProviderMock.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
  );
  expect(ensureUnlockedBeforeSecretSave.mock.invocationCallOrder[0]).toBeLessThan(
    setIsSaving.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
  );
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  expect(setIsSaving).toHaveBeenNthCalledWith(1, true);
  expect(setIsSaving).toHaveBeenLastCalledWith(false);
}

async function verifyProviderRejectsRemoteHttpBaseUrl() {
  const { saveProviderForm } = await import('./save');
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();

  await saveProviderForm({
    formData: {
      name: 'Remote provider',
      connectionType: 'openai-compatible',
      baseUrl: 'http://api.example.com/v1',
      apiKey: 'secret',
    },
    isEditing: false,
    onSave: vi.fn(),
    setErrors,
    setIsSaving,
  });

  expect(setErrors).toHaveBeenCalledWith({
    baseUrl: translate('settings.aiProviders.providerBaseUrlHttpsRequired'),
  });
  expect(addAIProviderMock).not.toHaveBeenCalled();
  expect(setIsSaving).not.toHaveBeenCalled();
}

async function verifyProviderAllowsLocalhostHttpBaseUrl() {
  const { saveProviderForm } = await import('./save');
  const onSave = vi.fn();
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();

  addAIProviderMock.mockResolvedValue(undefined);

  await saveProviderForm({
    formData: {
      name: 'Local provider',
      connectionType: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'secret',
    },
    isEditing: false,
    onSave,
    setErrors,
    setIsSaving,
  });

  expect(addAIProviderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUrl: 'http://127.0.0.1:11434/v1',
    })
  );
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(setErrors).not.toHaveBeenCalled();
}

async function verifyProviderEditPreservesStoredSecretWhenApiKeyIsBlank() {
  const { saveProviderForm } = await import('./save');
  const onSave = vi.fn();
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();
  const ensureUnlockedBeforeSecretSave = vi.fn().mockResolvedValue(undefined);

  updateAIProviderMock.mockResolvedValue(undefined);

  await saveProviderForm({
    formData: {
      name: 'Provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      apiKey: '',
    },
    isEditing: true,
    onSave,
    ensureUnlockedBeforeSecretSave,
    provider: {
      id: 'provider-1',
      name: 'Provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      hasStoredApiKey: true,
      createdAt: 1,
    },
    setErrors,
    setIsSaving,
  });

  expect(updateAIProviderMock).toHaveBeenCalledWith({
    id: 'provider-1',
    name: 'Provider',
    connectionType: 'openai-compatible',
    baseUrl: 'https://api.example.com',
    createdAt: 1,
  });
  expect(ensureUnlockedBeforeSecretSave).not.toHaveBeenCalled();
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(setErrors).not.toHaveBeenCalled();
}

async function verifyProviderEditRequiresReentryWhenSecretIsMissing() {
  const { saveProviderForm } = await import('./save');
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();

  await saveProviderForm({
    formData: {
      name: 'Provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      apiKey: '',
    },
    isEditing: true,
    onSave: vi.fn(),
    provider: {
      id: 'provider-1',
      name: 'Provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      hasStoredApiKey: false,
      createdAt: 1,
    },
    setErrors,
    setIsSaving,
  });

  expect(setErrors).toHaveBeenCalledWith({
    apiKey: translate('settings.aiProviders.providerApiKeyReentryRequired'),
  });
  expect(updateAIProviderMock).not.toHaveBeenCalled();
  expect(setIsSaving).not.toHaveBeenCalled();
}

describe('ai-providers-section-form-save', () => {
  beforeEach(resetAiProviderFormSaveMocks);

  it(
    'returns provider validation errors before starting save work',
    verifyProviderValidationErrors
  );
  it('persists a new provider on successful create', verifyProviderCreateFlow);
  it(
    'preserves an existing encrypted provider secret when edit keeps the API key blank',
    verifyProviderEditPreservesStoredSecretWhenApiKeyIsBlank
  );
  it(
    'rejects remote http provider URLs before persistence starts',
    verifyProviderRejectsRemoteHttpBaseUrl
  );
  it(
    'allows loopback http provider URLs for local providers',
    verifyProviderAllowsLocalhostHttpBaseUrl
  );
  it(
    'requires API key re-entry when the stored provider secret is missing',
    verifyProviderEditRequiresReentryWhenSecretIsMissing
  );
});
