import { beforeEach, expect, it, vi } from 'vitest';

const {
  authorizeWebSnapshotCaptureRequestMock,
  browserScriptingExecuteScriptMock,
  browserTabsGetMock,
  ensureActivePageAccessRuntimeMock,
  isOwnedSnapshotViewerPageMock,
  loadSettingsMock,
  sendViewerPopupExportMessageMock,
} = vi.hoisted(() => ({
  authorizeWebSnapshotCaptureRequestMock: vi.fn(),
  browserScriptingExecuteScriptMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  ensureActivePageAccessRuntimeMock: vi.fn(),
  isOwnedSnapshotViewerPageMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  sendViewerPopupExportMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/scripting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/scripting')>()),
  browserScripting: {
    executeScript: browserScriptingExecuteScriptMock,
  },
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
  ensureActivePageAccessRuntime: ensureActivePageAccessRuntimeMock,
}));

vi.mock('../../../../features/tab-capabilities/url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/tab-capabilities/url')>()),
  isOwnedSnapshotViewerPage: isOwnedSnapshotViewerPageMock,
}));

vi.mock('../../../capture/routing/web-snapshot/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/routing/web-snapshot/session')>()),
  authorizeWebSnapshotCaptureRequest: authorizeWebSnapshotCaptureRequestMock,
}));

vi.mock('../../../capture/page-preparation/viewer-ports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../capture/page-preparation/viewer-ports')>()),
  sendViewerPopupExportMessage: sendViewerPopupExportMessageMock,
}));

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY } from '../../../../features/web-snapshot/injected-runner-contract';
import { createBackgroundRuntimeState } from '../../../application/runtime-state';
import { routePopupExportMessage } from './popup-export-routing';

async function flushRouteWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function createSaveMessage() {
  return {
    requestId: 'req-web',
    tabId: 62,
    tabRouteCapabilityToken: 'cap-1',
    tabRouteRequestId: 'req-web',
    type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  };
}

function createInjectionResult(result: unknown): chrome.scripting.InjectionResult<unknown> {
  return { documentId: 'document-1', frameId: 0, result };
}

async function executeInjectedFunction(
  details: chrome.scripting.ScriptInjection<unknown[], unknown>
) {
  if ('func' in details && typeof details.func === 'function') {
    const args = (details as { args?: unknown[] }).args ?? [];
    return [createInjectionResult(await details.func(...args))];
  }

  return [createInjectionResult(undefined)];
}

beforeEach(() => {
  vi.clearAllMocks();
  loadSettingsMock.mockResolvedValue({
    anonymousCrossOriginSnapshotAssetsEnabled: false,
    authenticatedSnapshotAssetsEnabled: false,
  });
  browserTabsGetMock.mockResolvedValue({ id: 62, url: 'https://example.test/page' });
  ensureActivePageAccessRuntimeMock.mockResolvedValue(undefined);
  isOwnedSnapshotViewerPageMock.mockReturnValue(false);
});

it('prepares and reads injected runner state through scripting functions', async () => {
  const sendResponse = vi.fn();
  browserScriptingExecuteScriptMock.mockImplementation(async (details) => {
    if ('files' in details && details.files) {
      const state = Reflect.get(globalThis, INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY);
      if (typeof state !== 'object' || state === null) {
        throw new Error('Injected runner state was not prepared.');
      }
      Object.assign(state, {
        result: Promise.resolve({
          assetId: 'snapshot-1',
          success: true,
          warnings: [],
        }),
      });
      return [createInjectionResult(undefined)];
    }

    return executeInjectedFunction(details);
  });

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: createSaveMessage(),
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(sendResponse).toHaveBeenCalledWith({
    assetId: 'snapshot-1',
    success: true,
    warnings: [],
  });
  expect(Reflect.get(globalThis, INJECTED_WEB_SNAPSHOT_RUNNER_STATE_KEY)).toBeUndefined();
});

it('surfaces injected runner completion failures', async () => {
  const sendResponse = vi.fn();
  browserScriptingExecuteScriptMock.mockImplementation(executeInjectedFunction);

  routePopupExportMessage({
    deps: createBackgroundRuntimeState(),
    message: createSaveMessage(),
    resolvedTabId: 62,
    sendResponse,
    sender: undefined,
  });
  await flushRouteWork();

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'route web snapshot content export: Injected web snapshot runner did not complete.',
    success: false,
  });
});
