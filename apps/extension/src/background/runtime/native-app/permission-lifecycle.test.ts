import { beforeEach, expect, it, vi } from 'vitest';
import type { NativeAppRuntimeService } from './service-types';

const mocks = vi.hoisted(() => ({
  addedListener: null as ((permissions: chrome.permissions.Permissions) => void) | null,
  contains: vi.fn(),
  removedListener: null as ((permissions: chrome.permissions.Permissions) => void) | null,
}));

vi.mock('@sniptale/platform/browser/permissions', () => ({
  browserPermissions: {
    contains: mocks.contains,
    subscribeToAdded: (listener: (permissions: chrome.permissions.Permissions) => void) => {
      mocks.addedListener = listener;
      return vi.fn();
    },
    subscribeToRemoved: (listener: (permissions: chrome.permissions.Permissions) => void) => {
      mocks.removedListener = listener;
      return vi.fn();
    },
  },
}));

import { initializeNativeAppPermissionLifecycle } from './permission-lifecycle';

function createService(): NativeAppRuntimeService {
  return {
    canAutoConnect: vi.fn(async () => true),
    connect: vi.fn(),
    disconnectForPermissionRevocation: vi.fn(),
    getStatus: vi.fn(),
    quiesceForPrivacyErasure: vi.fn(),
    reconnect: vi.fn(),
    trustClient: vi.fn(),
    forgetClient: vi.fn(),
  };
}

async function flushAsync(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

beforeEach(() => {
  mocks.addedListener = null;
  mocks.removedListener = null;
  mocks.contains.mockReset();
});

it('connects only after native access is granted and disconnects after removal', async () => {
  const service = createService();
  mocks.contains
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  initializeNativeAppPermissionLifecycle(service);
  await flushAsync();

  expect(service.connect).not.toHaveBeenCalled();
  expect(service.disconnectForPermissionRevocation).toHaveBeenCalledOnce();

  mocks.addedListener?.({ permissions: ['nativeMessaging'] });
  await flushAsync();
  expect(service.connect).toHaveBeenCalledOnce();

  mocks.removedListener?.({ permissions: ['nativeMessaging'] });
  await flushAsync();
  expect(service.disconnectForPermissionRevocation).toHaveBeenCalledTimes(2);
});

it('ignores unrelated permission events', async () => {
  const service = createService();
  mocks.contains.mockResolvedValue(true);
  initializeNativeAppPermissionLifecycle(service);
  await flushAsync();

  mocks.removedListener?.({ permissions: ['downloads'] });
  await flushAsync();

  expect(mocks.contains).toHaveBeenCalledOnce();
  expect(service.disconnectForPermissionRevocation).not.toHaveBeenCalled();
});

it('preserves an intentional exit when the background runtime restarts', async () => {
  const service = createService();
  vi.mocked(service.canAutoConnect).mockResolvedValue(false);
  mocks.contains.mockResolvedValue(true);
  initializeNativeAppPermissionLifecycle(service);
  await flushAsync();
  expect(service.connect).not.toHaveBeenCalled();
});

it('does not disconnect an explicit connection after a delayed paused startup read', async () => {
  const service = createService();
  let finish!: (paused: boolean) => void;
  vi.mocked(service.canAutoConnect).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  mocks.contains.mockResolvedValue(true);
  initializeNativeAppPermissionLifecycle(service);
  await flushAsync();
  service.connect();
  finish(false);
  await flushAsync();
  expect(service.disconnectForPermissionRevocation).not.toHaveBeenCalled();
});
