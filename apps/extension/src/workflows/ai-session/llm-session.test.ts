import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiEgressAuthority } from '../../contracts/ai/egress-authority';

const { requestAISecretUnlockMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  requestAISecretUnlockMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('./secret-unlock-session', () => ({
  requestAISecretUnlock: requestAISecretUnlockMock,
}));

import { requestLlmSessionToken } from './llm-session';

const VALID_CONTENT_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';

function createContentAuthority(): AiEgressAuthority {
  return {
    captureMode: 'selected_editable',
    contractVersion: 1,
    payloadHash: VALID_CONTENT_HASH,
    purpose: 'content-ai-pick',
    riskClass: 'safe_text',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requestAISecretUnlockMock.mockResolvedValue(undefined);
});

it('opens AI secret unlock and retries with a fresh LLM session token', async () => {
  let llmRequestCount = 0;
  sendRuntimeMessageMock.mockImplementation(async (message: { type: string }) => {
    if (message.type === MessageType.REQUEST_LLM_SESSION) {
      llmRequestCount += 1;
      return llmRequestCount === 1
        ? {
            success: false,
            reason: 'ai-secrets-locked',
            error: 'AI provider secrets are locked',
          }
        : { success: true, token: 'fresh-token' };
    }
    return { success: false, error: 'Unexpected message' };
  });

  const egressAuthority = createContentAuthority();
  await expect(requestLlmSessionToken('content-ai-pick', egressAuthority)).resolves.toBe(
    'fresh-token'
  );
  expect(requestAISecretUnlockMock).toHaveBeenCalledWith('content-ai-pick');
  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    egressAuthority,
    purpose: 'content-ai-pick',
    type: MessageType.REQUEST_LLM_SESSION,
  });
});

it('rejects session requests when the egress authority purpose does not match', async () => {
  const egressAuthority = createContentAuthority();

  await expect(requestLlmSessionToken('scenario-editor', egressAuthority)).rejects.toThrow(
    'LLM egress authority purpose mismatch'
  );
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('surfaces LLM session request failures without opening the unlock flow', async () => {
  sendRuntimeMessageMock.mockResolvedValue({ success: false, error: 'denied' });

  await expect(requestLlmSessionToken('content-ai-pick', createContentAuthority())).rejects.toThrow(
    'denied'
  );
  expect(requestAISecretUnlockMock).not.toHaveBeenCalled();
});

it('surfaces retry failures after AI secret unlock', async () => {
  sendRuntimeMessageMock
    .mockResolvedValueOnce({
      success: false,
      reason: 'ai-secrets-locked',
      error: 'AI provider secrets are locked',
    })
    .mockResolvedValueOnce({ success: false, error: 'still locked' });

  await expect(requestLlmSessionToken('content-ai-pick', createContentAuthority())).rejects.toThrow(
    'still locked'
  );
  expect(requestAISecretUnlockMock).toHaveBeenCalledWith('content-ai-pick');
});
