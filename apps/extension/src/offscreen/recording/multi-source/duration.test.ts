import { beforeEach, expect, it, vi } from 'vitest';

const { sendRuntimeMessageMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: vi.fn() }),
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { initializeDurationPublishing } from './duration';
import type { MultiSourceSession } from './state';

beforeEach(() => {
  vi.clearAllMocks();
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

it('publishes elapsed multi-source duration on the session timer', async () => {
  vi.useFakeTimers();
  const session = {
    durationTimer: null,
    recordingId: 'multi-1',
    startedAt: Date.now() - 2_000,
  } as MultiSourceSession;

  initializeDurationPublishing(session);
  await vi.advanceTimersByTimeAsync(1_000);

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'RECORDING_DURATION_UPDATED',
    duration: expect.any(Number),
    recordingId: 'multi-1',
  });
  expect(session.durationTimer).not.toBeNull();

  if (session.durationTimer) {
    clearInterval(session.durationTimer);
  }
  vi.useRealTimers();
});
