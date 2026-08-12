import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  ensureOffscreen: vi.fn(),
  list: vi.fn(),
  retain: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  waitForReady: vi.fn(),
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
vi.mock('../../../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../offscreen-document/service')>()),
  ensureOffscreenDocument: mocks.ensureOffscreen,
  waitForOffscreenReady: mocks.waitForReady,
}));
vi.mock('./camera-peer-cleanup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./camera-peer-cleanup')>()),
  completeVideoRecordingCameraPeerCleanup: mocks.complete,
  listPendingVideoRecordingCameraPeerCleanup: mocks.list,
  retainVideoRecordingCameraPeerCleanup: mocks.retain,
}));

import {
  closeVideoRecordingCameraPeerForLease,
  listVideoRecordingMediaDevices,
  recoverPendingVideoRecordingCameraPeerCleanup,
  resetVideoRecordingCameraPeerRetryForTests,
  switchVideoRecordingCameraPeerInput,
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
  mocks.ensureOffscreen.mockResolvedValue(undefined);
  mocks.list.mockResolvedValue([]);
  mocks.retain.mockResolvedValue(undefined);
  mocks.sendRuntimeMessage.mockResolvedValue({ success: true });
  mocks.waitForReady.mockResolvedValue(undefined);
});

it('enumerates only the requested media-device kind through the ready offscreen owner', async () => {
  const mediaDevices = [{ deviceId: 'camera-a', kind: 'videoinput' as const, label: 'Camera A' }];
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: true, mediaDevices });

  await expect(listVideoRecordingMediaDevices('videoinput')).resolves.toEqual(mediaDevices);

  expect(mocks.ensureOffscreen).toHaveBeenCalledOnce();
  expect(mocks.waitForReady).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      deviceKind: 'videoinput',
      type: 'OFFSCREEN_VIDEO_RECORDING_MEDIA_DEVICES',
    })
  );
});

it('rejects an unacknowledged media-device catalog response', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false, error: 'permission denied' });
  await expect(listVideoRecordingMediaDevices('audioinput')).rejects.toThrow('permission denied');
});

it('switches the active camera input without replacing its document peer', async () => {
  await expect(switchVideoRecordingCameraPeerInput(lease, 'camera-b')).resolves.toBeUndefined();

  expect(mocks.ensureOffscreen).toHaveBeenCalledOnce();
  expect(mocks.waitForReady).toHaveBeenCalledOnce();
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'OFFSCREEN_VIDEO_RECORDING_CAMERA_SWITCH',
    deviceId: 'camera-b',
    peerId: 'surface-1:2:3',
  });
});

it('rejects explicit and malformed camera-switch failures', async () => {
  mocks.sendRuntimeMessage.mockResolvedValueOnce({ success: false, error: 'switch failed' });
  await expect(switchVideoRecordingCameraPeerInput(lease, 'camera-b')).rejects.toThrow(
    'switch failed'
  );

  mocks.sendRuntimeMessage.mockResolvedValueOnce(undefined);
  await expect(switchVideoRecordingCameraPeerInput(lease, null)).rejects.toThrow(
    'Camera input switch was not acknowledged'
  );
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
