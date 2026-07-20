import { expect, it } from 'vitest';

import { createNativeStorage } from './service-storage.test-support';
import { postNativeControllerAcquire } from './service-controller-acquire';
import { createInitialNativeAppRuntimeStatus } from './status';
import { createNativeTestPort } from './service.test-support';

it('updates status when controller profile identity cannot be loaded', async () => {
  let status = createInitialNativeAppRuntimeStatus('native.host');
  const port = createNativeTestPort();
  const storage = createNativeStorage();
  storage.local.get.mockRejectedValueOnce(new Error('storage failed'));

  await postNativeControllerAcquire({
    connectionId: 'conn-1',
    extensionId: 'extension-id',
    getConnectionId: () => 'conn-1',
    getPort: () => port,
    port,
    reason: 'initial-connect',
    storage,
    updateStatus: (updater) => {
      status = updater(status);
    },
  });

  expect(port.postMessage).not.toHaveBeenCalled();
  expect(status).toEqual(
    expect.objectContaining({
      connectionState: 'error',
      error: expect.objectContaining({ code: 'storage-failed' }),
    })
  );
});

it('ignores stale controller profile identity failures after reconnect', async () => {
  let status = createInitialNativeAppRuntimeStatus('native.host');
  const oldPort = createNativeTestPort();
  const newPort = createNativeTestPort();
  const storage = createNativeStorage();
  storage.local.get.mockRejectedValueOnce(new Error('storage failed'));

  await postNativeControllerAcquire({
    connectionId: 'old-conn',
    extensionId: 'extension-id',
    getConnectionId: () => 'new-conn',
    getPort: () => newPort,
    port: oldPort,
    reason: 'initial-connect',
    storage,
    updateStatus: (updater) => {
      status = updater(status);
    },
  });

  expect(status.connectionState).toBe('not-connected');
  expect(oldPort.postMessage).not.toHaveBeenCalled();
  expect(newPort.postMessage).not.toHaveBeenCalled();
});
