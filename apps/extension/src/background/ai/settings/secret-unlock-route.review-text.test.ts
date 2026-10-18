import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY } from '../../../composition/persistence/ai-settings/constants';
import type {
  AISecretUnlockMessage,
  AISecretUnlockResponse,
} from '../../../contracts/messaging/ai-secret-unlock';

const { sessionState, loadProtectionStatus, unlockProtection, createWindow } = vi.hoisted(() => {
  const sessionState: Record<string, unknown> = {};
  return {
    sessionState,
    loadProtectionStatus: vi.fn(),
    unlockProtection: vi.fn(),
    createWindow: vi.fn(),
  };
});

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  runtimeInfo: { getURL: (path: string) => `chrome-extension://extension-id/${path}` },
}));

vi.mock('@sniptale/platform/browser/windows', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/windows')>()),
  browserWindows: { create: createWindow },
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/browser-storage')
  >()),
  browserStorage: {
    session: {
      get: async (key: string) => ({ [key]: sessionState[key] }),
      set: async (values: Record<string, unknown>) => {
        Object.assign(sessionState, values);
      },
      remove: async (key: string) => {
        delete sessionState[key];
      },
    },
  },
}));

vi.mock('../../../composition/persistence/ai-settings/graph-mutations', () => ({
  loadSerializedAISecretProtectionStatus: loadProtectionStatus,
  mutateStoredAISettings: (command: { passphrase: string }) => unlockProtection(command.passphrase),
}));

import {
  authorizeAISecretUnlockSender,
  resetAISecretUnlockRequestsForTests,
  routeAISecretUnlockMessage,
} from './secret-unlock-route';
import { createAISecretUnlockRouteContext } from './secret-unlock-route.test-support';

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(sessionState)) delete sessionState[key];
  vi.stubGlobal('chrome', { runtime: { id: 'extension-id' } });
  resetAISecretUnlockRequestsForTests();
  createWindow.mockResolvedValue(undefined);
  unlockProtection.mockResolvedValue(undefined);
  loadProtectionStatus.mockResolvedValue({
    isEnabled: true,
    isUnlocked: false,
    mode: 'passphrase',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function route(
  message: AISecretUnlockMessage,
  sender: chrome.runtime.MessageSender
): Promise<AISecretUnlockResponse> {
  const context = authorizeAISecretUnlockSender(message, sender)
    ? null
    : createAISecretUnlockRouteContext(message);
  return new Promise((resolve, reject) => {
    const respond = (response: AISecretUnlockResponse | undefined) => {
      if (!response) {
        reject(new Error('Expected unlock response'));
        return;
      }
      resolve(response);
    };
    expect(routeAISecretUnlockMessage(message, sender, respond, context)).toBe(true);
  });
}

it.each(['gallery', 'video-editor'] as const)(
  'completes persisted review-text unlock from %s without admitting a foreign owner or replay',
  async (page) => {
    const owner: chrome.runtime.MessageSender = {
      documentId: `${page}-document`,
      frameId: 0,
      id: 'extension-id',
      url: `chrome-extension://extension-id/apps/extension/src/${page}/index.html`,
    };
    const started = await route(
      { type: MessageType.AI_SECRET_UNLOCK, operation: 'start', purpose: 'review-text' },
      owner
    );
    expect(started).toMatchObject({ success: true, status: 'pending' });
    if (!started.success || !started.requestId) throw new Error('Expected pending request');
    const requestId = started.requestId;
    const statusMessage = {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'status',
      requestId,
    } as const;
    expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toEqual({
      [requestId]: expect.objectContaining({ purpose: 'review-text', status: 'pending' }),
    });

    resetAISecretUnlockRequestsForTests();
    expect(await route(statusMessage, owner)).toEqual({
      success: true,
      requestId,
      status: 'pending',
    });
    resetAISecretUnlockRequestsForTests();
    expect(await route(statusMessage, { ...owner, documentId: 'foreign-document' })).toMatchObject({
      success: false,
      status: 'failed',
    });
    expect(unlockProtection).not.toHaveBeenCalled();

    const submitMessage = {
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'submit',
      passphrase: 'passphrase',
      requestId,
    } as const;
    const settings = {
      url: `chrome-extension://extension-id/apps/extension/src/settings/index.html?aiUnlock=1&requestId=${requestId}`,
    };
    expect(await route(submitMessage, settings)).toEqual({
      success: true,
      requestId,
      status: 'completed',
    });
    expect(unlockProtection).toHaveBeenCalledExactlyOnceWith('passphrase');
    expect(sessionState[AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY]).toEqual({
      [requestId]: expect.objectContaining({ purpose: 'review-text', status: 'completed' }),
    });
    loadProtectionStatus.mockResolvedValue({
      isEnabled: true,
      isUnlocked: true,
      mode: 'passphrase',
    });
    resetAISecretUnlockRequestsForTests();
    expect(await route(statusMessage, owner)).toEqual({
      success: true,
      requestId,
      status: 'completed',
    });
    expect(await route(submitMessage, settings)).toMatchObject({ success: false });
    expect(unlockProtection).toHaveBeenCalledTimes(1);
  }
);
