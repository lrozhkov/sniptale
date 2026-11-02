import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { createSecretProtectionClient, SecretProtectionClientError } from './secret-protection';

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import {
  addAIModel,
  addAIProvider,
  clearAIProviderSecret,
  deleteAIModel,
  deleteAIProvider,
  isAiSettingsMutationError,
  saveChromeAiEnabled,
  saveGlobalSystemPrompt,
  saveScenarioEditorSystemPrompt,
  updateAIModel,
  updateAIProvider,
} from './ai-settings/mutations';

const transport: Pick<RuntimeMessagingTransport, 'sendRuntimeMessage'> = {
  sendRuntimeMessage: vi.fn(),
};
const send = vi.mocked(transport.sendRuntimeMessage);
const client = createSecretProtectionClient(transport);
const wireType = MessageType.AI_SETTINGS_MUTATION;

beforeEach(() => {
  vi.resetAllMocks();
  send.mockResolvedValue({ success: true, result: 'accepted' });
});

describe('shared Settings secret protection client', () => {
  it('reads participant status through the injected background transport', async () => {
    const status = {
      isEnabled: true,
      isUnlocked: false,
      mode: 'passphrase' as const,
      participants: { ai: false, webdav: true },
    };
    send.mockResolvedValue({ success: true, secretProtectionStatus: status });

    await expect(client.readStatus()).resolves.toEqual(status);
    expect(send).toHaveBeenCalledWith({
      type: wireType,
      operation: 'read-secret-protection-status',
    });
    expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  });

  it('retains legacy optional participant status for the common owner to classify', async () => {
    const status = { isEnabled: true, isUnlocked: false, mode: 'passphrase' as const };
    send.mockResolvedValue({ success: true, secretProtectionStatus: status });
    await expect(client.readStatus()).resolves.toEqual(status);
  });

  it('rejects a status response without a required payload', async () => {
    send.mockResolvedValue({ success: true });
    await expect(client.readStatus()).rejects.toThrow(
      'Secret protection status response is missing'
    );
  });

  it('rejects failed status responses even when they contain an old payload', async () => {
    send.mockResolvedValue({
      success: false,
      error: 'Status is unavailable',
      secretProtectionStatus: { isEnabled: false, isUnlocked: true, mode: 'transparent' },
    });
    await expect(client.readStatus()).rejects.toThrow('Status is unavailable');
  });

  it.each(['ai', 'webdav'] as const)(
    'sends explicit %s enrollment and opt-out without an omitted phrase property',
    async (participant) => {
      await client.enable(participant);
      await client.disable(participant);
      expect(send.mock.calls.map(([request]) => request)).toEqual([
        { type: wireType, operation: 'enable-secret-passphrase-protection', participant },
        { type: wireType, operation: 'disable-secret-passphrase-protection', participant },
      ]);
    }
  );

  it.each(['ai', 'webdav'] as const)(
    'sends %s participant and the supplied phrase for enrollment and opt-out',
    async (participant) => {
      await client.enable(participant, 'new-phrase');
      await client.disable(participant, 'current-phrase');
      expect(send.mock.calls.map(([request]) => request)).toEqual([
        {
          type: wireType,
          operation: 'enable-secret-passphrase-protection',
          participant,
          passphrase: 'new-phrase',
        },
        {
          type: wireType,
          operation: 'disable-secret-passphrase-protection',
          participant,
          passphrase: 'current-phrase',
        },
      ]);
    }
  );

  it('routes shared unlock, lock, phrase change and global reset through unchanged operations', async () => {
    await client.unlock('current-phrase');
    await client.lock();
    await client.change({ currentPassphrase: 'current-phrase', nextPassphrase: 'next-phrase' });
    await client.reset();
    expect(send.mock.calls.map(([request]) => request)).toEqual([
      {
        type: wireType,
        operation: 'unlock-secret-passphrase-protection',
        passphrase: 'current-phrase',
      },
      { type: wireType, operation: 'lock-secret-passphrase-protection' },
      {
        type: wireType,
        operation: 'change-secret-passphrase-protection',
        currentPassphrase: 'current-phrase',
        nextPassphrase: 'next-phrase',
      },
      { type: wireType, operation: 'reset-secret-passphrase-protection' },
    ]);
  });

  it('preserves structured native refusal reasons and allows an explicit retry', async () => {
    send.mockResolvedValueOnce({
      success: false,
      error: 'Secret storage is locked',
      reason: 'ai-secrets-locked',
    });
    await expect(client.enable('webdav')).rejects.toMatchObject({
      name: 'SecretProtectionClientError',
      message: 'Secret storage is locked',
      reason: 'ai-secrets-locked',
    });
    await expect(client.enable('webdav', 'current-phrase')).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uses the shared failure when a refusal has no message', async () => {
    send.mockResolvedValue({ success: false });
    await expect(client.reset()).rejects.toEqual(
      new SecretProtectionClientError('Secret protection request failed', undefined)
    );
  });

  it('propagates transport failure without dispatching another command', async () => {
    send.mockRejectedValue(new Error('Transport unavailable'));
    await expect(client.lock()).rejects.toThrow('Transport unavailable');
    expect(send).toHaveBeenCalledTimes(1);
  });
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

it('keeps provider mutations in the existing AI runtime owner', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });
  await expect(addAIProvider(provider)).resolves.toBeUndefined();
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    operation: 'add-provider',
    provider,
    type: wireType,
  });
  expect(send).not.toHaveBeenCalled();
});

it('preserves provider, model, prompt and Chrome AI mutation routing', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ result: 'accepted', success: true });
  await updateAIProvider(provider);
  await clearAIProviderSecret('provider-1');
  await deleteAIProvider('provider-1');
  await addAIModel(model, 'incarnation');
  await updateAIModel(model, 'incarnation');
  await deleteAIModel('model-1');
  await saveGlobalSystemPrompt('global prompt');
  await saveScenarioEditorSystemPrompt('scenario prompt');
  await saveChromeAiEnabled(true);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'update-provider', provider })
  );
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({ operation: 'save-chrome-ai-enabled', enabled: true })
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

it('preserves the AI mutation fallback message', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ success: false });
  await expect(addAIProvider(provider)).rejects.toMatchObject({
    message: 'AI settings mutation failed',
    reason: undefined,
  });
});
