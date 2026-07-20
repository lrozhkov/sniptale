import { expect, it, vi } from 'vitest';

import type { StoredAISecretUnlockRequest } from '../../../composition/persistence/ai-settings/secret-unlock-requests.store.ts';

const { resolveLlmSessionSenderKeyMock } = vi.hoisted(() => ({
  resolveLlmSessionSenderKeyMock: vi.fn(),
}));

vi.mock('../llm/session-tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../llm/session-tokens')>()),
  resolveLlmSessionSenderKey: resolveLlmSessionSenderKeyMock,
}));

import { isUnlockRequestOwner } from './secret-unlock-route-owner';

function createRecord(senderKey: string): StoredAISecretUnlockRequest {
  return {
    createdAt: 1,
    expiresAt: 2,
    operation: 'ai-secret-unlock',
    purpose: 'content-ai-pick',
    requestId: 'request-1',
    senderKey,
    status: 'pending',
  };
}

it('matches content and scenario sender ownership keys', () => {
  resolveLlmSessionSenderKeyMock.mockReturnValueOnce('content-owner');
  expect(isUnlockRequestOwner(createRecord('content-owner'), {})).toBe(true);

  resolveLlmSessionSenderKeyMock.mockReturnValueOnce(null).mockReturnValueOnce('scenario-owner');
  expect(isUnlockRequestOwner(createRecord('scenario-owner'), {})).toBe(true);

  resolveLlmSessionSenderKeyMock.mockReturnValue(null);
  expect(isUnlockRequestOwner(createRecord('other-owner'), {})).toBe(false);
});
