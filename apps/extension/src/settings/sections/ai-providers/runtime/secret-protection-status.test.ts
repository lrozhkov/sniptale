import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { requestAISecretProtectionStatus } from './secret-protection-status';
import {
  addAIModel,
  addAIProvider,
  changeAISecretPassphraseProtection,
  clearAIProviderSecret,
  deleteAIModel,
  deleteAIProvider,
  disableAISecretPassphraseProtection,
  enableAISecretPassphraseProtection,
  isAiSettingsMutationError,
  lockAISecretPassphraseProtection,
  resetAISecretPassphraseProtection,
  saveChromeAiEnabled,
  saveDefaultModelId,
  saveGlobalSystemPrompt,
  saveScenarioEditorSystemPrompt,
  unlockAISecretPassphraseProtection,
  updateAIModel,
  updateAIProvider,
} from './settings-mutations';

beforeEach(() => {
  vi.clearAllMocks();
});

const provider = {
  baseUrl: 'https://api.example.com',
  connectionType: 'openai-compatible' as const,
  createdAt: 1,
  id: 'provider-1',
  name: 'Provider',
};

const model = {
  displayName: 'Model',
  id: 'model-1',
  modelCode: 'gpt-test',
  providerId: 'provider-1',
};

it('requests AI secret protection status from the background runtime owner', async () => {
  sendRuntimeMessageMock.mockResolvedValue({
    secretProtectionStatus: {
      isEnabled: true,
      isUnlocked: false,
      mode: 'passphrase',
    },
    success: true,
  });

  await expect(requestAISecretProtectionStatus()).resolves.toEqual({
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    operation: 'read-secret-protection-status',
    type: MessageType.AI_SETTINGS_MUTATION,
  });
});

it('rejects AI secret protection status responses without a typed payload', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ success: true });

  await expect(requestAISecretProtectionStatus()).rejects.toThrow(
    'AI secret protection status request failed'
  );
});

it('sends AI settings mutations through the runtime contract', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });

  await expect(addAIProvider(provider)).resolves.toBeUndefined();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    operation: 'add-provider',
    provider,
    type: MessageType.AI_SETTINGS_MUTATION,
  });
});

it('routes provider, model, prompt, and default model mutations through the runtime contract', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });
  await updateAIProvider(provider);
  await clearAIProviderSecret('provider-1');
  await deleteAIProvider('provider-1');
  await addAIModel(model);
  await updateAIModel(model);
  await deleteAIModel('model-1');
  await saveDefaultModelId('model-1');
  await saveGlobalSystemPrompt('global prompt');
  await saveScenarioEditorSystemPrompt('scenario prompt');
  await saveChromeAiEnabled(true);

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'update-provider', provider })
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'save-default-model', defaultModelId: 'model-1' })
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'save-chrome-ai-enabled', enabled: true })
  );
});

it('routes secret protection mutations through the runtime contract', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });

  await enableAISecretPassphraseProtection('next-passphrase');
  await disableAISecretPassphraseProtection('current-passphrase');
  await changeAISecretPassphraseProtection({
    currentPassphrase: 'current-passphrase',
    nextPassphrase: 'next-passphrase',
  });
  await lockAISecretPassphraseProtection();
  await unlockAISecretPassphraseProtection('current-passphrase');
  await resetAISecretPassphraseProtection();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'enable-secret-passphrase-protection' })
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'unlock-secret-passphrase-protection' })
  );
});

it('preserves structured AI settings mutation failure reasons', async () => {
  sendRuntimeMessageMock.mockResolvedValue({
    error: 'Secret storage is locked',
    reason: 'ai-secrets-locked',
    success: false,
  });

  try {
    await addAIProvider(provider);
    throw new Error('Expected addAIProvider to reject');
  } catch (error) {
    expect(isAiSettingsMutationError(error)).toBe(true);
    expect(error).toMatchObject({
      message: 'Secret storage is locked',
      reason: 'ai-secrets-locked',
    });
  }
});

it('falls back when an AI settings mutation failure has no error message', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ success: false });

  await expect(addAIProvider(provider)).rejects.toMatchObject({
    message: 'AI settings mutation failed',
    reason: undefined,
  });
});
