import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { TabRuntimeCapability } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { installBackgroundRuntimeMessagingMock } from '../../routing-contracts/runtime-messaging/mock';
import { enablePreparationByCapability, disablePreparationByCapability } from './route';
import { createAckingViewerPortRegistration } from './viewer-ports.test-support';

const sendTabMessageMock = vi.hoisted(() => vi.fn());
const getZoomMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { getZoom: getZoomMock },
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendTabMessage: sendTabMessageMock,
}));

beforeEach(() => {
  sendTabMessageMock.mockReset();
  sendTabMessageMock.mockResolvedValue({ success: true });
  getZoomMock.mockReset();
  getZoomMock.mockResolvedValue(1);
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
});

it('routes regular page preparation through the content-script message', async () => {
  getZoomMock.mockResolvedValue(2);
  await enablePreparationByCapability({
    capability: TabRuntimeCapability.Regular,
    ports: new Map(),
    surfaceCapabilityToken: 'surface-token',
    surfaceLeaseGeneration: 2,
    surfaceOperationGeneration: 3,
    tabId: 7,
    viewport: {
      presetId: 'test:viewport',
      target: 'viewport',
      width: 320,
      height: 240,
    },
  });

  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    pageZoom: 2,
    surfaceCapabilityToken: 'surface-token',
    surfaceLeaseGeneration: 2,
    surfaceOperationGeneration: 3,
    viewport: {
      presetId: 'test:viewport',
      target: 'viewport',
      width: 320,
      height: 240,
    },
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

it('rejects a negative content teardown acknowledgement', async () => {
  sendTabMessageMock.mockResolvedValueOnce({
    error: 'Design Review session restoration failed',
    success: false,
  });

  await expect(
    disablePreparationByCapability({
      capability: TabRuntimeCapability.Regular,
      ports: new Map(),
      tabId: 7,
    })
  ).rejects.toThrow('Design Review session restoration failed');
});

it('forwards pinned-toolbar visibility through regular page preparation', async () => {
  await enablePreparationByCapability({
    capability: TabRuntimeCapability.Regular,
    ports: new Map(),
    surfaceCapabilityToken: 'surface-token',
    surfaceOperationGeneration: 0,
    tabId: 7,
    toolbarVisible: false,
    viewport: null,
  });

  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    pageZoom: 1,
    surfaceCapabilityToken: 'surface-token',
    surfaceOperationGeneration: 0,
    toolbarVisible: false,
    type: MessageType.ENABLE_SCREENSHOT_MODE,
    viewport: null,
  });
});

it('routes owned snapshot viewer preparation through the registered port', async () => {
  const registration = createAckingViewerPortRegistration();
  const ports = new Map([[9, registration]]);

  await enablePreparationByCapability({
    capability: TabRuntimeCapability.OwnedSnapshotViewer,
    ports,
    surfaceCapabilityToken: 'surface-token',
    surfaceOperationGeneration: 0,
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
      command: {
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        surfaceCapabilityToken: 'surface-token',
        viewport: null,
      },
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
      surfaceCapabilityToken: 'surface-token',
      surfaceOperationGeneration: 0,
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
      surfaceCapabilityToken: 'surface-token',
      surfaceOperationGeneration: 0,
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
