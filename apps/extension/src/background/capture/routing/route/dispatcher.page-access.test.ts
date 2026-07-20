import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserTabsGetMock,
  handleFullCaptureMock,
  handleVisibleCaptureMock,
  handleTriggerQuickActionMock,
  ensureActivePageAccessRuntimeMock,
  ensureNativeVisibleCaptureAuthorityMock,
  isOwnedSnapshotViewerPageMock,
} = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  handleFullCaptureMock: vi.fn(),
  handleVisibleCaptureMock: vi.fn(),
  handleTriggerQuickActionMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  ensureNativeVisibleCaptureAuthorityMock: vi.fn(),
  isOwnedSnapshotViewerPageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    get: (...args: unknown[]) => browserTabsGetMock(...args),
  },
}));

vi.mock('../../../../features/tab-capabilities/url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/tab-capabilities/url')>()),
  isOwnedSnapshotViewerPage: (...args: unknown[]) => isOwnedSnapshotViewerPageMock(...args),
}));

vi.mock('../handlers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../handlers')>()),
  handleFullCapture: handleFullCaptureMock,
  handleVisibleCapture: handleVisibleCaptureMock,
}));

vi.mock('../actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../actions')>()),
  handleTriggerQuickAction: handleTriggerQuickActionMock,
}));

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { createScenarioSessionServiceStub } from '../../../../../../../tooling/test/support/scenario-session-service.stub';
import { routeCaptureMessage } from './dispatcher';
import { flushRouteAsync } from './dispatcher.test-support';

function createRouteArgs() {
  return {
    captureGuardState: { isCapturing: false },
    resolvedTabId: 42,
    scenarioSessionService: createScenarioSessionServiceStub(),
    screenshotModeState: new Map([[42, true]]),
    sendResponse: vi.fn(),
    viewportState: new Map<number, { width: number; height: number } | null>([
      [42, { width: 1280, height: 720 }],
    ]),
    pageAccessPort: {
      ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
      ensureNativeVisibleCaptureAuthority: ensureNativeVisibleCaptureAuthorityMock,
    },
    webSnapshotViewerPorts: new Map(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  handleFullCaptureMock.mockReturnValue(true);
  handleVisibleCaptureMock.mockReturnValue(true);
  handleTriggerQuickActionMock.mockReturnValue(true);
  browserTabsGetMock.mockResolvedValue({ id: 42, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  ensureNativeVisibleCaptureAuthorityMock.mockResolvedValue(undefined);
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
});

it('rejects screenshot capture without page access before handler side effects', async () => {
  const args = createRouteArgs();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('Page access is required.'));

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: CaptureMessageType.CAPTURE_FULL },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(handleFullCaptureMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('rejects quick actions without page access before handler side effects', async () => {
  const args = createRouteArgs();
  ensureActivePageAccessRuntimeMock.mockRejectedValue(new Error('Page access is required.'));

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: 'TRIGGER_QUICK_ACTION', actionId: 'viewer-action' },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(handleTriggerQuickActionMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Page access is required.',
    success: false,
  });
});

it('fails quick actions closed when page access port is missing', async () => {
  const { pageAccessPort: _pageAccessPort, ...args } = createRouteArgs();

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: 'TRIGGER_QUICK_ACTION', actionId: 'viewer-action' },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).not.toHaveBeenCalled();
  expect(handleTriggerQuickActionMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Page access port unavailable.',
    success: false,
  });
});

it('rejects native visible capture without native capture authority before handler side effects', async () => {
  const args = createRouteArgs();
  args.viewportState.set(42, null);
  ensureNativeVisibleCaptureAuthorityMock.mockRejectedValue(
    new Error('Visible capture requires all-sites access or active tab activation.')
  );

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: CaptureMessageType.CAPTURE_VISIBLE },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(ensureNativeVisibleCaptureAuthorityMock).toHaveBeenCalledWith(42);
  expect(handleVisibleCaptureMock).not.toHaveBeenCalled();
  expect(args.sendResponse).toHaveBeenCalledWith({
    error: 'Visible capture requires all-sites access or active tab activation.',
    success: false,
  });
});

it('does not require native capture authority for viewport-backed visible capture', async () => {
  const args = createRouteArgs();

  expect(
    routeCaptureMessage({
      ...args,
      message: { type: CaptureMessageType.CAPTURE_VISIBLE },
    })
  ).toBe(true);
  await flushRouteAsync();

  expect(ensureActivePageAccessRuntimeMock).toHaveBeenCalledWith(42);
  expect(ensureNativeVisibleCaptureAuthorityMock).not.toHaveBeenCalled();
  expect(handleVisibleCaptureMock).toHaveBeenCalledOnce();
});
