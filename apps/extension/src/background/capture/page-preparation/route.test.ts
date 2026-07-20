import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';
import { enablePreparationByCapability, disablePreparationByCapability } from './route';
import { createAckingViewerPortRegistration } from './viewer-ports.test-support';

const sendTabMessageMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendTabMessage: sendTabMessageMock,
}));

beforeEach(() => {
  sendTabMessageMock.mockReset();
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
});

it('routes regular page preparation through the content-script message', async () => {
  await enablePreparationByCapability({
    capability: TabRuntimeCapability.Regular,
    ports: new Map(),
    tabId: 7,
    viewport: { width: 320, height: 240 },
  });

  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    viewport: { width: 320, height: 240 },
  });

  await disablePreparationByCapability({
    capability: TabRuntimeCapability.Regular,
    ports: new Map(),
    tabId: 7,
  });

  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: MessageType.DISABLE_SCREENSHOT_MODE,
  });
});

it('routes owned snapshot viewer preparation through the registered port', async () => {
  const registration = createAckingViewerPortRegistration();
  const ports = new Map([[9, registration]]);

  await enablePreparationByCapability({
    capability: TabRuntimeCapability.OwnedSnapshotViewer,
    ports,
    tabId: 9,
    viewport: null,
  });
  await disablePreparationByCapability({
    capability: TabRuntimeCapability.OwnedSnapshotViewer,
    ports,
    tabId: 9,
  });

  expect(registration.port.postMessage).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      command: { type: MessageType.ENABLE_SCREENSHOT_MODE, viewport: null },
    })
  );
  expect(registration.port.postMessage).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      command: { type: MessageType.DISABLE_SCREENSHOT_MODE },
    })
  );
  expect(sendTabMessageMock).not.toHaveBeenCalled();
});

it('rejects missing owned snapshot viewer ports with a clear error', async () => {
  await expect(
    enablePreparationByCapability({
      capability: TabRuntimeCapability.OwnedSnapshotViewer,
      ports: new Map(),
      tabId: 9,
      viewport: null,
    })
  ).rejects.toThrow('Web snapshot viewer is not ready');
});

it('rejects restricted enable requests and ignores restricted disable requests', async () => {
  await expect(
    enablePreparationByCapability({
      capability: TabRuntimeCapability.Restricted,
      ports: new Map(),
      tabId: 13,
      viewport: null,
    })
  ).rejects.toThrow('Page preparation is unavailable');

  await expect(
    disablePreparationByCapability({
      capability: TabRuntimeCapability.Restricted,
      ports: new Map(),
      tabId: 13,
    })
  ).resolves.toBeUndefined();
  expect(sendTabMessageMock).not.toHaveBeenCalled();
});
