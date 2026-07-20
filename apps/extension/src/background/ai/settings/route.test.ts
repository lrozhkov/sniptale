import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const {
  hasPreauthorizedAiSettingsMutationMessageMock,
  loadAISecretProtectionStatusMock,
  loggerWarnMock,
  mutateAiSettingsMock,
} = vi.hoisted(() => ({
  hasPreauthorizedAiSettingsMutationMessageMock: vi.fn(),
  loadAISecretProtectionStatusMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  mutateAiSettingsMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://extension-id/${path}`,
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: loggerWarnMock }),
}));

vi.mock('../../../composition/persistence/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/ai-settings')>()),
  loadAISecretProtectionStatus: loadAISecretProtectionStatusMock,
}));

vi.mock('./mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mutations')>()),
  mutateAiSettings: mutateAiSettingsMock,
}));

vi.mock('./authorization/preauthorization', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/preauthorization')>()),
  hasPreauthorizedAiSettingsMutationMessage: hasPreauthorizedAiSettingsMutationMessageMock,
}));

import { routeAiSettingsMutationMessage } from './route';
import { AISecretPassphraseLockedError } from '../../../composition/persistence/ai-settings/secret-protection.store.ts';

beforeEach(() => {
  vi.clearAllMocks();
  hasPreauthorizedAiSettingsMutationMessageMock.mockReturnValue(true);
  mutateAiSettingsMock.mockResolvedValue(undefined);
  loadAISecretProtectionStatusMock.mockResolvedValue({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
  });
});

it('allows settings page AI mutations', async () => {
  const sendResponse = vi.fn();
  const message = {
    operation: 'save-global-prompt',
    prompt: 'Prompt',
    type: MessageType.AI_SETTINGS_MUTATION,
  } as const;

  expect(
    routeAiSettingsMutationMessage(
      message,
      { url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html' },
      sendResponse
    )
  ).toBe(true);

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' })
  );
  expect(mutateAiSettingsMock).toHaveBeenCalledWith(message);
});

it('allows settings page default model persistence', async () => {
  const sendResponse = vi.fn();
  const message = {
    defaultModelId: 'model-1',
    operation: 'save-default-model',
    type: MessageType.AI_SETTINGS_MUTATION,
  } as const;

  expect(
    routeAiSettingsMutationMessage(
      message,
      { url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html' },
      sendResponse
    )
  ).toBe(true);

  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenLastCalledWith({ success: true, result: 'accepted' })
  );
  expect(mutateAiSettingsMock).toHaveBeenCalledWith(message);
});

it('rejects content senders for default model persistence', () => {
  const sendResponse = vi.fn();
  hasPreauthorizedAiSettingsMutationMessageMock.mockReturnValue(false);
  const sender = { tab: { id: 7 } as chrome.tabs.Tab, url: 'https://example.test/page' };

  expect(
    routeAiSettingsMutationMessage(
      {
        defaultModelId: 'model-1',
        operation: 'save-default-model',
        type: MessageType.AI_SETTINGS_MUTATION,
      },
      sender,
      sendResponse
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized AI settings mutation sender',
  });
  expect(mutateAiSettingsMock).not.toHaveBeenCalled();
});

it('rejects content senders for provider/model mutations', () => {
  const sendResponse = vi.fn();
  hasPreauthorizedAiSettingsMutationMessageMock.mockReturnValue(false);

  expect(
    routeAiSettingsMutationMessage(
      {
        operation: 'delete-provider',
        providerId: 'provider-1',
        type: MessageType.AI_SETTINGS_MUTATION,
      },
      { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized AI settings mutation sender',
  });
  expect(mutateAiSettingsMock).not.toHaveBeenCalled();
  expect(loggerWarnMock).toHaveBeenCalled();
});

it('returns background-owned AI secret protection status to settings pages', async () => {
  const sendResponse = vi.fn();

  routeAiSettingsMutationMessage(
    {
      operation: 'read-secret-protection-status',
      type: MessageType.AI_SETTINGS_MUTATION,
    },
    { url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html' },
    sendResponse
  );

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      secretProtectionStatus: {
        isEnabled: true,
        isUnlocked: true,
        mode: 'passphrase',
      },
      success: true,
    });
  });
  expect(mutateAiSettingsMock).not.toHaveBeenCalled();
});

it('rejects content senders for provider secret clears', () => {
  const sendResponse = vi.fn();
  hasPreauthorizedAiSettingsMutationMessageMock.mockReturnValue(false);

  expect(
    routeAiSettingsMutationMessage(
      {
        operation: 'clear-provider-secret',
        providerId: 'provider-1',
        type: MessageType.AI_SETTINGS_MUTATION,
      },
      { tab: { id: 7 } as chrome.tabs.Tab },
      sendResponse
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized AI settings mutation sender',
  });
  expect(mutateAiSettingsMock).not.toHaveBeenCalled();
});

it('returns typed locked failures for protected AI secret mutations', async () => {
  const sendResponse = vi.fn();
  mutateAiSettingsMock.mockRejectedValue(new AISecretPassphraseLockedError());

  routeAiSettingsMutationMessage(
    {
      operation: 'add-provider',
      provider: {
        apiKey: 'secret',
        baseUrl: 'https://api.example.com/v1',
        connectionType: 'openai-compatible',
        createdAt: 1,
        id: 'provider-1',
        name: 'Provider',
      },
      type: MessageType.AI_SETTINGS_MUTATION,
    },
    { url: 'chrome-extension://extension-id/apps/extension/src/settings/index.html' },
    sendResponse
  );

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      reason: 'ai-secrets-locked',
      error: 'AI provider secrets are locked',
    });
  });
});
