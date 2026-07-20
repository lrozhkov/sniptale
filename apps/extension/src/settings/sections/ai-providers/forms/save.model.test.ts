import type { SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';

const { addAIModelMock, loggerErrorMock, toastErrorMock, updateAIModelMock } = vi.hoisted(() => ({
  addAIModelMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
  updateAIModelMock: vi.fn(),
}));

vi.mock('../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/settings-mutations')>()),
  addAIModel: addAIModelMock,
  addAIProvider: vi.fn(),
  updateAIModel: updateAIModelMock,
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

function resetModelFormSaveMocks() {
  addAIModelMock.mockReset();
  loggerErrorMock.mockReset();
  toastErrorMock.mockReset();
  updateAIModelMock.mockReset();
  vi.stubGlobal('crypto', {
    randomUUID: () => 'generated-id',
  });
}

async function verifyModelSaveErrorPath() {
  const { saveModelForm } = await import('./save');
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();

  addAIModelMock.mockRejectedValue(new Error('save failed'));

  await saveModelForm({
    formData: {
      providerId: 'provider-1',
      displayName: 'Model',
      modelCode: 'gpt-test',
      systemPrompt: '',
    },
    isEditing: false,
    onSave: vi.fn(),
    setErrors,
    setIsSaving,
  });

  expect(addAIModelMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'generated-id',
      providerId: 'provider-1',
      displayName: 'Model',
      modelCode: 'gpt-test',
    })
  );
  expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  expect(toastErrorMock).toHaveBeenCalledTimes(1);
  expect(setIsSaving).toHaveBeenNthCalledWith(1, true);
  expect(setIsSaving).toHaveBeenLastCalledWith(false);
  expect(setErrors).toHaveBeenCalledWith({
    submit:
      `${translate('common.states.error')}` +
      `${translate('settings.aiProviders.modelSaveErrorSuffix')}: save failed`,
  });
}

async function verifyModelCreateOmitsEmptyPrompt() {
  const { saveModelForm } = await import('./save');
  const onSave = vi.fn();
  const setErrors = createStateSetterMock<Record<string, string>>();
  const setIsSaving = createStateSetterMock<boolean>();

  addAIModelMock.mockResolvedValue(undefined);

  await saveModelForm({
    formData: {
      providerId: 'provider-1',
      displayName: 'Model',
      modelCode: 'gpt-test',
      systemPrompt: '',
    },
    isEditing: false,
    onSave,
    setErrors,
    setIsSaving,
  });

  expect(addAIModelMock).toHaveBeenCalledWith({
    id: 'generated-id',
    providerId: 'provider-1',
    displayName: 'Model',
    modelCode: 'gpt-test',
  });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(setErrors).not.toHaveBeenCalled();
}

describe('ai-providers-section-form-save.model', () => {
  beforeEach(resetModelFormSaveMocks);

  it('shows a toast and logs when model persistence fails', verifyModelSaveErrorPath);
  it(
    'omits empty system prompts from create payloads before model persistence starts',
    verifyModelCreateOmitsEmptyPrompt
  );
});
