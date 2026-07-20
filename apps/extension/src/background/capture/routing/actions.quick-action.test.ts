import { beforeEach, expect, it, vi } from 'vitest';

const { browserTabsGetMock, handleQuickActionMock } = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
  handleQuickActionMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

vi.mock('../quick-actions/index', () => ({
  handleQuickAction: handleQuickActionMock,
}));

import { handleTriggerQuickAction } from './actions.quick-action';
import { createScenarioSessionServiceStub } from '../../../../../../tooling/test/support/scenario-session-service.stub';

beforeEach(() => {
  vi.clearAllMocks();
  browserTabsGetMock.mockResolvedValue({ id: 42, url: 'https://example.com' });
  handleQuickActionMock.mockResolvedValue({ result: 'accepted' });
});

function createContext(sendResponse: (response?: unknown) => void) {
  const pageAccessPort = {
    ensureActivePageAccessRuntime: vi.fn(),
    ensureNativeVisibleCaptureAuthority: vi.fn(),
  };

  return {
    resolvedTabId: 42,
    sendResponse,
    viewportState: new Map([[42, { width: 1280, height: 720 }]]),
    screenshotModeState: new Map([[42, true]]),
    captureGuardState: { isCapturing: false },
    pageAccessPort,
    scenarioSessionService: createScenarioSessionServiceStub(),
    webSnapshotViewerPorts: new Map(),
  };
}

it('routes quick actions through browser tab lookup and async responses', async () => {
  const sendResponse = vi.fn();
  const context = createContext(sendResponse);

  expect(handleTriggerQuickAction({ actionId: 'quick-action-1' }, context)).toBe(true);

  await vi.waitFor(() => {
    expect(handleQuickActionMock).toHaveBeenCalledWith({
      actionId: 'quick-action-1',
      tabId: 42,
      tab: { id: 42, url: 'https://example.com' },
      viewportState: context.viewportState,
      screenshotModeState: context.screenshotModeState,
      captureGuardState: context.captureGuardState,
      pageAccessPort: context.pageAccessPort,
      webSnapshotViewerPorts: context.webSnapshotViewerPorts,
    });
    expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  });
});

it('reports tab lookup failures through route errors', async () => {
  const tabFailureResponse = vi.fn();

  browserTabsGetMock
    .mockRejectedValueOnce(new Error('tab failed'))
    .mockResolvedValueOnce({ id: 42, url: 'https://example.com' });

  expect(
    handleTriggerQuickAction({ actionId: 'quick-action-2' }, createContext(tabFailureResponse))
  ).toBe(true);

  await vi.waitFor(() => {
    expect(tabFailureResponse).toHaveBeenCalledWith({
      success: false,
      error: 'tab failed',
    });
  });
});

it('reports quick-action failures through route errors', async () => {
  const quickActionFailureResponse = vi.fn();

  browserTabsGetMock.mockResolvedValueOnce({ id: 42, url: 'https://example.com' });
  handleQuickActionMock.mockRejectedValueOnce(new Error('quick action failed'));

  expect(
    handleTriggerQuickAction(
      { actionId: 'quick-action-3' },
      createContext(quickActionFailureResponse)
    )
  ).toBe(true);

  await vi.waitFor(() => {
    expect(quickActionFailureResponse).toHaveBeenCalledWith({
      success: false,
      error: 'quick action failed',
    });
  });
});

it('reports failed quick-action results as route errors', async () => {
  const sendResponse = vi.fn();
  handleQuickActionMock.mockResolvedValueOnce({ result: 'failed', error: 'capture denied' });

  expect(
    handleTriggerQuickAction({ actionId: 'quick-action-4' }, createContext(sendResponse))
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'capture denied',
      result: 'failed',
    });
  });
});

it('reports blocked quick-action results as route errors', async () => {
  const sendResponse = vi.fn();
  handleQuickActionMock.mockResolvedValueOnce({ result: 'blocked' });

  expect(
    handleTriggerQuickAction({ actionId: 'quick-action-5' }, createContext(sendResponse))
  ).toBe(true);

  await vi.waitFor(() => {
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Quick action is blocked',
      result: 'blocked',
    });
  });
});
