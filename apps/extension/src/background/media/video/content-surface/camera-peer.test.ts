import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  list: vi.fn(),
  retain: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('@sniptale/platform/security/offscreen-command-capability', () => ({
  attachOffscreenCommandCapability: (message: unknown) => message,
}));
vi.mock('../../../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../routing-contracts/runtime-messaging/services')
  >()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));
vi.mock('./camera-peer-cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./camera-peer-cleanup')>()),
  completeVideoRecordingCameraPeerCleanup: mocks.complete,
  listPendingVideoRecordingCameraPeerCleanup: mocks.list,
  retainVideoRecordingCameraPeerCleanup: mocks.retain,
}));

import {
  closeVideoRecordingCameraPeerForLease,
  recoverPendingVideoRecordingCameraPeerCleanup,
  resetVideoRecordingCameraPeerRetryForTests,
} from './camera-peer';

const lease = {
  documentGeneration: 2,
  peerGeneration: 3,
  surfaceSessionId: 'surface-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  resetVideoRecordingCameraPeerRetryForTests();
  mocks.complete.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue([]);
  mocks.retain.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
});

it('keeps a volatile peer-retirement obligation when close and ledger persistence both fail', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false, error: 'close failed' });
  mocks.retain.mockRejectedValueOnce(new Error('storage failed'));

  await expect(closeVideoRecordingCameraPeerForLease(lease)).rejects.toThrow(
    'durable retirement could not be recorded'
  );

  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
  await expect(recoverPendingVideoRecordingCameraPeerCleanup()).resolves.toBe(true);
  expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ peerId: 'surface-1:2:3' })
  );
  expect(mocks.complete).toHaveBeenCalledWith('surface-1:2:3');
});
