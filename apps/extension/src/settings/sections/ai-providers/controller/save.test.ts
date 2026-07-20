import { expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';

const {
  loggerErrorMock,
  saveDefaultModelIdMock,
  saveGlobalSystemPromptMock,
  saveScenarioEditorSystemPromptMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  saveDefaultModelIdMock: vi.fn(),
  saveGlobalSystemPromptMock: vi.fn(),
  saveScenarioEditorSystemPromptMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/settings-mutations')>()),
  saveDefaultModelId: saveDefaultModelIdMock,
  saveGlobalSystemPrompt: saveGlobalSystemPromptMock,
  saveScenarioEditorSystemPrompt: saveScenarioEditorSystemPromptMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

import {
  saveAiProvidersDefaultModel,
  saveAiProvidersGlobalPrompt,
  saveAiProvidersScenarioEditorPrompt,
} from './save';

it('persists default model and prompt values with translated success toasts', async () => {
  const setDefaultModelId = vi.fn();

  saveDefaultModelIdMock.mockResolvedValue(undefined);
  saveGlobalSystemPromptMock.mockResolvedValue(undefined);
  saveScenarioEditorSystemPromptMock.mockResolvedValue(undefined);

  await saveAiProvidersDefaultModel('model-2', setDefaultModelId);
  await saveAiProvidersGlobalPrompt('Use strict schema validation');
  await saveAiProvidersScenarioEditorPrompt('Use scenario summary guardrails');

  expect(setDefaultModelId).toHaveBeenCalledWith('model-2');
  expect(saveDefaultModelIdMock).toHaveBeenCalledWith('model-2');
  expect(saveGlobalSystemPromptMock).toHaveBeenCalledWith('Use strict schema validation');
  expect(saveScenarioEditorSystemPromptMock).toHaveBeenCalledWith(
    'Use scenario summary guardrails'
  );
  expect(toastSuccessMock).toHaveBeenCalledWith(
    translate('settings.aiProviders.defaultModelUpdated')
  );
  expect(toastSuccessMock).toHaveBeenCalledWith(
    translate('settings.aiProviders.globalPromptSavedMessage')
  );
  expect(toastSuccessMock).toHaveBeenCalledWith(
    translate('settings.aiProviders.scenarioEditorPromptSavedMessage')
  );
});

it('keeps local state unchanged and returns prompt errors when persistence fails', async () => {
  const setDefaultModelId = vi.fn();

  saveDefaultModelIdMock.mockRejectedValueOnce(new Error('default failed'));
  saveGlobalSystemPromptMock.mockRejectedValueOnce(new Error('global failed'));
  saveScenarioEditorSystemPromptMock.mockRejectedValueOnce(new Error('scenario failed'));

  const defaultModelSaved = await saveAiProvidersDefaultModel('model-2', setDefaultModelId);
  const globalPromptError = await saveAiProvidersGlobalPrompt('Use strict schema validation');
  const scenarioPromptError = await saveAiProvidersScenarioEditorPrompt(
    'Use scenario summary guardrails'
  );

  expect(defaultModelSaved).toBe(false);
  expect(setDefaultModelId).not.toHaveBeenCalled();
  expect(globalPromptError).toBe(
    `${translate('common.states.error')}${translate('settings.aiProviders.globalPromptSaveErrorSuffix')}`
  );
  expect(scenarioPromptError).toBe(
    `${translate('common.states.error')}${translate('settings.aiProviders.scenarioEditorPromptSaveErrorSuffix')}`
  );
  expect(loggerErrorMock).toHaveBeenCalledTimes(3);
  expect(toastErrorMock).toHaveBeenCalledWith(
    `${translate('common.states.error')}${translate('settings.aiProviders.defaultModelSaveErrorSuffix')}`
  );
});
