import type { SetStateAction } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { AiSettingsMutationError } from '../runtime/settings-mutations';
import { translate } from '../../../../platform/i18n';

const { addAIProviderMock, loggerErrorMock, toastErrorMock } = vi.hoisted(() => ({
  addAIProviderMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/settings-mutations')>()),
  addAIModel: vi.fn(),
  addAIProvider: addAIProviderMock,
  updateAIModel: vi.fn(),
  updateAIProvider: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    child: () => ({
      child: vi.fn(),
      debug: vi.fn(),
      error: loggerErrorMock,
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    }),
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
  },
}));

function createStateSetterMock<T>() {
  return vi.fn<(value: SetStateAction<T>) => void>();
}

beforeEach(() => {
  addAIProviderMock.mockReset();
  loggerErrorMock.mockReset();
  toastErrorMock.mockReset();
});

it('surfaces provider persistence failures back into the form state', async () => {
  const { saveProviderForm } = await import('./save');
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();

  addAIProviderMock.mockRejectedValue(new Error('save failed'));

  await saveProviderForm({
    formData: {
      name: 'Provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      apiKey: 'secret',
    },
    isEditing: false,
    onSave: vi.fn(),
    setErrors,
    setIsSaving,
  });

  expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  expect(setErrors).toHaveBeenCalledWith({
    submit:
      `${translate('common.states.error')}` +
      `${translate('settings.aiProviders.providerSaveErrorSuffix')}: save failed`,
  });
  expect(toastErrorMock).toHaveBeenCalledWith(
    `${translate('common.states.error')}` +
      `${translate('settings.aiProviders.providerSaveErrorSuffix')}: save failed`
  );
  expect(setIsSaving).toHaveBeenNthCalledWith(1, true);
  expect(setIsSaving).toHaveBeenLastCalledWith(false);
});

it('preserves structured locked-secret mutation reasons in the provider submit error', async () => {
  const { saveProviderForm } = await import('./save');
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();

  addAIProviderMock.mockRejectedValue(
    new AiSettingsMutationError('AI settings mutation failed', 'ai-secrets-locked')
  );

  await saveProviderForm({
    formData: {
      name: 'Provider',
      connectionType: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      apiKey: 'secret',
    },
    isEditing: false,
    onSave: vi.fn(),
    setErrors,
    setIsSaving,
  });

  expect(setErrors).toHaveBeenCalledWith({
    submit: translate('settings.aiProviders.providerSaveSecretLocked'),
  });
  expect(toastErrorMock).toHaveBeenCalledWith(
    translate('settings.aiProviders.providerSaveSecretLocked')
  );
});
