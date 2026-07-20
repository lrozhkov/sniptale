import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { requestAISecretUnlock } from './secret-unlock-session';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('starts an unlock request and polls until it is completed', async () => {
  sendRuntimeMessageMock.mockImplementation(async (message: { type: string }) => {
    if (
      message.type === MessageType.AI_SECRET_UNLOCK &&
      'operation' in message &&
      message.operation === 'start'
    ) {
      return {
        success: true,
        requestId: '00000000-0000-4000-8000-000000000001',
        status: 'pending',
      };
    }

    return {
      success: true,
      requestId: '00000000-0000-4000-8000-000000000001',
      status: 'completed',
    };
  });

  const unlockPromise = requestAISecretUnlock('content-ai-pick');

  await vi.waitFor(() => {
    expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
      purpose: 'content-ai-pick',
      type: MessageType.AI_SECRET_UNLOCK,
      operation: 'start',
    });
  });
  await vi.advanceTimersByTimeAsync(500);

  await expect(unlockPromise).resolves.toBeUndefined();
  expect(sendRuntimeMessageMock).toHaveBeenLastCalledWith({
    requestId: '00000000-0000-4000-8000-000000000001',
    type: MessageType.AI_SECRET_UNLOCK,
    operation: 'status',
  });
});

it('returns immediately when start reports already completed', async () => {
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    status: 'completed',
  });

  await expect(requestAISecretUnlock('content-ai-pick')).resolves.toBeUndefined();
  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
});

it('fails when status polling reports restart-required', async () => {
  sendRuntimeMessageMock.mockImplementation(async (message: { type: string }) => {
    if (
      message.type === MessageType.AI_SECRET_UNLOCK &&
      'operation' in message &&
      message.operation === 'start'
    ) {
      return {
        success: true,
        requestId: '00000000-0000-4000-8000-000000000001',
        status: 'pending',
      };
    }

    return {
      error: 'AI secret unlock submission state was interrupted',
      requestId: '00000000-0000-4000-8000-000000000001',
      status: 'restart-required',
      success: false,
    };
  });

  const unlockPromise = requestAISecretUnlock('content-ai-pick');
  const rejection = expect(unlockPromise).rejects.toThrow(
    'AI secret unlock submission state was interrupted'
  );
  await vi.advanceTimersByTimeAsync(500);

  await rejection;
});

it.each(['expired', 'failed', 'restart-required'] as const)(
  'fails when status polling reports %s with a successful envelope',
  async (status) => {
    sendRuntimeMessageMock.mockImplementation(async (message: { type: string }) => {
      if (
        message.type === MessageType.AI_SECRET_UNLOCK &&
        'operation' in message &&
        message.operation === 'start'
      ) {
        return {
          success: true,
          requestId: '00000000-0000-4000-8000-000000000001',
          status: 'pending',
        };
      }

      return {
        requestId: '00000000-0000-4000-8000-000000000001',
        status,
        success: true,
      };
    });

    const unlockPromise = requestAISecretUnlock('content-ai-pick');
    const rejection = expect(unlockPromise).rejects.toThrow(
      'AI provider secrets unlock was cancelled'
    );
    await vi.advanceTimersByTimeAsync(500);

    await rejection;
  }
);
