import { expect, it, vi } from 'vitest';

import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';
import type { LlmSessionPurpose } from '../../../contracts/messaging/llm';

const { resolveLlmSessionSenderKeyMock } = vi.hoisted(() => ({
  resolveLlmSessionSenderKeyMock: vi.fn(),
}));

vi.mock('../llm/session-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../llm/session-tokens')>()),
  resolveLlmSessionSenderKey: resolveLlmSessionSenderKeyMock,
}));

import { isUnlockRequestOwner } from './secret-unlock-route-owner';

function createRecord(senderKey: string, purpose: LlmSessionPurpose): StoredAISecretUnlockRequest {
  return {
    createdAt: 1,
    expiresAt: 2,
    operation: 'ai-secret-unlock',
    purpose,
    requestId: 'request-1',
    senderKey,
    status: 'pending',
  };
}

it.each(['content-ai-pick', 'scenario-editor', 'review-text'] as const)(
  'resolves ownership using the recorded %s purpose',
  (purpose) => {
    resolveLlmSessionSenderKeyMock.mockReset();
    const sender: chrome.runtime.MessageSender = {};
    resolveLlmSessionSenderKeyMock.mockReturnValueOnce('owner-key');
    expect(isUnlockRequestOwner(createRecord('owner-key', purpose), sender)).toBe(true);
    expect(resolveLlmSessionSenderKeyMock).toHaveBeenCalledExactlyOnceWith(purpose, sender);

    resolveLlmSessionSenderKeyMock.mockReset().mockReturnValue(null);
    expect(isUnlockRequestOwner(createRecord('other-owner', purpose), sender)).toBe(false);
    expect(resolveLlmSessionSenderKeyMock).toHaveBeenCalledExactlyOnceWith(purpose, sender);
  }
);
