import { expect, vi } from 'vitest';
import * as runtimeMessagingMock from '../../../apps/extension/src/background/routing-contracts/runtime-messaging/mock';
import {
  backgroundTabMessageTypesForRuntimeMessagingTests,
  videoRuntimeMessageTypesForRuntimeMessagingTests,
} from './background-runtime-messaging-routes.test-support';
export { expectListenerResult } from './background-runtime-messaging-assertions.test-support';

const {
  browserRuntimeSubscribeToMessagesMock,
  browserScriptingExecuteScriptMock,
  browserTabsGetMock,
  browserTabsQueryMock,
  ensureActivePageAccessRuntimeMock,
  hasActivePageAccessMock,
  isBackgroundInternalSignalMessageMock,
  isBackgroundTabMessageMock,
  isPopupExportViewerMessageMock,
  isRouteCaptureMessageMock,
  isScenarioMessageMock,
  isTabModeMessageMock,
  isVideoControlMessageMock,
  isVideoRuntimeMessageMock,
  loggerDebugMock,
  loggerErrorMock,
  loggerWarnMock,
  loadSettingsMock,
  parseBackgroundRuntimeMessageMock,
  routeCaptureMessageMock,
  routeAISecretUnlockMessageMock,
  routeAiSettingsMutationMessageMock,
  routeLlmMessageMock,
  routeLlmSessionMessageMock,
  routeLocalDataErasureMessageMock,
  routeScenarioEditorLlmMessageMock,
  routeScenarioMessageMock,
  routeTabModeMessageMock,
  routeVideoControlMessageMock,
  routeVideoRuntimeMessageMock,
  sendTabMessageMock,
  sendViewerPopupExportMessageMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  browserScriptingExecuteScriptMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  hasActivePageAccessMock: vi.fn(),
  isBackgroundInternalSignalMessageMock: vi.fn(),
  isBackgroundTabMessageMock: vi.fn(),
  isPopupExportViewerMessageMock: vi.fn(),
  isRouteCaptureMessageMock: vi.fn(),
  isScenarioMessageMock: vi.fn(),
  isTabModeMessageMock: vi.fn(),
  isVideoControlMessageMock: vi.fn(),
  isVideoRuntimeMessageMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  parseBackgroundRuntimeMessageMock: vi.fn(),
  routeCaptureMessageMock: vi.fn(),
  routeAISecretUnlockMessageMock: vi.fn(),
  routeAiSettingsMutationMessageMock: vi.fn(),
  routeLlmMessageMock: vi.fn(),
  routeLlmSessionMessageMock: vi.fn(),
  routeLocalDataErasureMessageMock: vi.fn(),
  routeScenarioEditorLlmMessageMock: vi.fn(),
  routeScenarioMessageMock: vi.fn(),
  routeTabModeMessageMock: vi.fn(),
  routeVideoControlMessageMock: vi.fn(),
  routeVideoRuntimeMessageMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  sendViewerPopupExportMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { subscribeToMessages: browserRuntimeSubscribeToMessagesMock },
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));
vi.mock('@sniptale/platform/browser/scripting', () => ({
  browserScripting: { executeScript: browserScriptingExecuteScriptMock },
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { get: browserTabsGetMock, query: browserTabsQueryMock },
}));
vi.mock(
  '../../../apps/extension/src/background/runtime/page-access/service',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../apps/extension/src/background/runtime/page-access/service')
    >()),
    ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
    hasActivePageAccess: hasActivePageAccessMock,
  })
);
vi.mock('../../../apps/extension/src/contracts/messaging/parsers/boundary', () => ({
  parseBackgroundRuntimeMessage: parseBackgroundRuntimeMessageMock,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: loggerDebugMock, error: loggerErrorMock, warn: loggerWarnMock }),
}));
vi.mock('../../../apps/extension/src/platform/runtime-messaging/index', () => ({
  getErrorMessage: (error: unknown, fallback = 'Unknown error') =>
    error instanceof Error ? error.message : fallback,
  sendTabMessage: sendTabMessageMock,
}));
vi.mock('../../../apps/extension/src/composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../apps/extension/src/composition/persistence/settings')
  >()),
  loadSettings: loadSettingsMock,
}));
vi.mock('../../../apps/extension/src/background/capture/routing/index', () => ({
  routeCaptureMessage: routeCaptureMessageMock,
}));
vi.mock('../../../apps/extension/src/background/ai/settings/route', () => ({
  routeAiSettingsMutationMessage: routeAiSettingsMutationMessageMock,
}));
vi.mock('../../../apps/extension/src/background/ai/settings/secret-unlock-route', () => ({
  authorizeAISecretUnlockSender: vi.fn(() => null),
  routeAISecretUnlockMessage: routeAISecretUnlockMessageMock,
}));
vi.mock('../../../apps/extension/src/background/application/privacy-erasure/route', () => ({
  routeLocalDataErasureMessage: routeLocalDataErasureMessageMock,
}));
vi.mock('../../../apps/extension/src/background/runtime/routing/message-guards/guards/tab', () => ({
  backgroundTabMessageTypes: backgroundTabMessageTypesForRuntimeMessagingTests,
  isBackgroundInternalSignalMessage: isBackgroundInternalSignalMessageMock,
  isBackgroundTabMessage: isBackgroundTabMessageMock,
  isPopupExportViewerMessage: isPopupExportViewerMessageMock,
  isRouteCaptureMessage: isRouteCaptureMessageMock,
  isScenarioMessage: isScenarioMessageMock,
  isTabModeMessage: isTabModeMessageMock,
  isVideoControlMessage: isVideoControlMessageMock,
}));
vi.mock('../../../apps/extension/src/background/capture/page-preparation/viewer-ports', () => ({
  createWebSnapshotViewerPorts: () => new Map(),
  sendViewerPopupExportMessage: sendViewerPopupExportMessageMock,
}));
vi.mock(
  '../../../apps/extension/src/background/runtime/routing/message-guards/guards/video-runtime',
  () => ({
    isVideoRuntimeMessage: isVideoRuntimeMessageMock,
    videoRuntimeMessageTypes: videoRuntimeMessageTypesForRuntimeMessagingTests,
  })
);
vi.mock('../../../apps/extension/src/background/ai/llm/router', () => ({
  routeLlmMessage: routeLlmMessageMock,
}));
vi.mock('../../../apps/extension/src/background/ai/llm/session-route', () => ({
  routeLlmSessionMessage: routeLlmSessionMessageMock,
}));
vi.mock('../../../apps/extension/src/background/ai/llm/editor-router', () => ({
  routeScenarioEditorLlmMessage: routeScenarioEditorLlmMessageMock,
}));
vi.mock('../../../apps/extension/src/background/scenario/router', () => ({
  routeScenarioMessage: routeScenarioMessageMock,
}));
vi.mock('../../../apps/extension/src/background/runtime/tab-mode-router', () => ({
  routeTabModeMessage: routeTabModeMessageMock,
}));
vi.mock('../../../apps/extension/src/background/media/video/runtime/manager/control-route', () => ({
  routeVideoControlMessage: routeVideoControlMessageMock,
}));
vi.mock('../../../apps/extension/src/background/media/video/runtime/router', () => ({
  routeVideoRuntimeMessage: routeVideoRuntimeMessageMock,
}));

import * as backgroundRuntimeMessaging from '../../../apps/extension/src/background/runtime/routing/boundary/listener';
import { createScenarioSessionServiceStub } from './scenario-session-service.stub';

export {
  browserScriptingExecuteScriptMock,
  ensureActivePageAccessRuntimeMock,
  hasActivePageAccessMock,
  browserTabsQueryMock,
  browserTabsGetMock,
  isBackgroundInternalSignalMessageMock,
  isBackgroundTabMessageMock,
  isPopupExportViewerMessageMock,
  isRouteCaptureMessageMock,
  isScenarioMessageMock,
  isTabModeMessageMock,
  isVideoControlMessageMock,
  isVideoRuntimeMessageMock,
  loggerErrorMock,
  loggerWarnMock,
  loadSettingsMock,
  parseBackgroundRuntimeMessageMock,
  routeCaptureMessageMock,
  routeAISecretUnlockMessageMock,
  routeAiSettingsMutationMessageMock,
  routeLlmMessageMock,
  routeLlmSessionMessageMock,
  routeLocalDataErasureMessageMock,
  routeScenarioEditorLlmMessageMock,
  routeScenarioMessageMock,
  routeTabModeMessageMock,
  routeVideoControlMessageMock,
  routeVideoRuntimeMessageMock,
  sendTabMessageMock,
  sendViewerPopupExportMessageMock,
};

function createDeps() {
  return {
    screenshotModeState: new Map<number, boolean>(),
    highlighterModeState: new Map<number, boolean>(),
    quickEditModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map(),
    viewportState: new Map<number, { width: number; height: number } | null>(),
    captureGuardState: { isCapturing: false },
    webSnapshotViewerPorts: new Map(),
    scenarioSessionService: createScenarioSessionServiceStub(),
  };
}

export function createSender(tabId?: number, url?: string): chrome.runtime.MessageSender {
  return {
    ...(tabId === undefined ? {} : { tab: { id: tabId } as chrome.tabs.Tab }),
    ...(url === undefined ? {} : { url }),
  };
}

export function createTopLevelContentSender(
  tabId: number,
  url: string
): chrome.runtime.MessageSender {
  return {
    ...createSender(tabId, url),
    documentId: `document-${tabId}`,
    frameId: 0,
  };
}

export function createSendResponse() {
  return vi.fn();
}

export const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function mockRoutesAsUnhandled(...mocks: Array<ReturnType<typeof vi.fn>>) {
  mocks.forEach((mock) => mock.mockReturnValue(false));
}

function getRegisteredListener() {
  expect(browserRuntimeSubscribeToMessagesMock).toHaveBeenCalledTimes(1);
  const listener = browserRuntimeSubscribeToMessagesMock.mock.calls[0]?.[0];
  expect(listener).toBeTypeOf('function');
  return listener as (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: ReturnType<typeof createSendResponse>
  ) => boolean;
}

export function resetRuntimeMessagingMocks() {
  vi.clearAllMocks();
  mockRoutesAsUnhandled(isBackgroundInternalSignalMessageMock, isBackgroundTabMessageMock);
  mockRoutesAsUnhandled(isPopupExportViewerMessageMock, isRouteCaptureMessageMock);
  mockRoutesAsUnhandled(isScenarioMessageMock, isTabModeMessageMock);
  mockRoutesAsUnhandled(isVideoControlMessageMock, isVideoRuntimeMessageMock);
  browserScriptingExecuteScriptMock.mockResolvedValue([
    { frameId: 0, result: { assetId: 'snapshot-1', success: true, warnings: [] } },
  ]);
  browserTabsGetMock.mockResolvedValue({ id: 1, url: 'https://example.test' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  hasActivePageAccessMock.mockResolvedValue(true);
  loadSettingsMock.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: true,
  });
  mockRoutesAsUnhandled(routeCaptureMessageMock, routeAISecretUnlockMessageMock);
  mockRoutesAsUnhandled(routeAiSettingsMutationMessageMock, routeLlmMessageMock);
  mockRoutesAsUnhandled(routeLlmSessionMessageMock, routeLocalDataErasureMessageMock);
  mockRoutesAsUnhandled(routeScenarioEditorLlmMessageMock, routeScenarioMessageMock);
  mockRoutesAsUnhandled(routeTabModeMessageMock);
  routeVideoRuntimeMessageMock.mockReturnValue({ handled: false, keepChannelOpen: false });
  sendTabMessageMock.mockResolvedValue({ success: true });
  runtimeMessagingMock.installBackgroundRuntimeMessagingMock({
    sendTabMessage: sendTabMessageMock,
  });
  sendViewerPopupExportMessageMock.mockResolvedValue({ success: true });
}

export function registerListener() {
  const deps = createDeps();
  const sendResponse = createSendResponse();
  backgroundRuntimeMessaging.registerBackgroundRuntimeMessageListener(deps);
  return {
    deps,
    listener: getRegisteredListener(),
    sendResponse,
    subscribeMock: browserRuntimeSubscribeToMessagesMock,
  };
}
