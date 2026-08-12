import { beforeEach, expect, it, vi } from 'vitest';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  clearTimer: vi.fn(),
  createPublisher: vi.fn(),
  publishState: vi.fn(),
  publishSurfaceState: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: mocks.sendRuntimeMessage,
}));

vi.mock('../timer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../timer')>()),
  createCountdownBadgeTimer: () => ({ clear: mocks.clearTimer, sync: vi.fn() }),
}));

vi.mock('./publish-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./publish-state')>()),
  createVideoRecordingRuntimeStatePublisher: mocks.createPublisher.mockImplementation(() => ({
    publishState: mocks.publishState,
  })),
}));

vi.mock('../../../content-surface/runtime-state-sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content-surface/runtime-state-sync')>()),
  publishVideoRecordingSurfaceRuntimeState: mocks.publishSurfaceState,
}));

import { createVideoRecordingRuntimeStateService } from './runtime-state-service';

beforeEach(() => {
  vi.clearAllMocks();
});

it('owns set, merge, publish, and reset for one isolated recording runtime state', () => {
  const service = createVideoRecordingRuntimeStateService();
  expect(service.getState()).toMatchObject({
    duration: 0,
    status: VideoRecordingStatus.IDLE,
  });
  expect(mocks.createPublisher).toHaveBeenCalledWith(
    expect.objectContaining({
      sendContentSurfaceState: mocks.publishSurfaceState,
      sendRuntimeMessage: mocks.sendRuntimeMessage,
    })
  );

  const recording = service.setState({
    duration: 8,
    status: VideoRecordingStatus.RECORDING,
  });
  expect(recording).toMatchObject({ duration: 8, status: VideoRecordingStatus.RECORDING });
  expect(service.getState()).toBe(recording);
  expect(mocks.publishState).toHaveBeenLastCalledWith(recording);

  const idle = service.resetState();
  expect(idle).toMatchObject({ duration: 0, status: VideoRecordingStatus.IDLE });
  expect(service.getState()).toBe(idle);
  expect(mocks.clearTimer).toHaveBeenCalledOnce();
  expect(mocks.publishState).toHaveBeenLastCalledWith(idle);
});
