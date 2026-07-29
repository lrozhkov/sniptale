import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginScreenshotSurfaceSession,
  bindScreenshotSurfaceSession,
  getScreenshotSurfaceSession,
  resetScreenshotSurfaceSessionsForTests,
} from '../../capture-surface/screenshot-session';

const { browserTabsGetMock } = vi.hoisted(() => ({
  browserTabsGetMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: browserTabsGetMock,
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function verifyBuildScreenshotModeStatusResponse() {
  const { buildScreenshotModeStatusResponse } = await import('./status');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportState = new Map<
    number,
    { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
  >([[5, { presetId: 'test:viewport', target: 'viewport' as const, width: 1440, height: 900 }]]);
  const sendResponse = vi.fn();

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });
  const surfaceSession = beginScreenshotSurfaceSession(5);
  bindScreenshotSurfaceSession({ documentId: 'content-document-5', tabId: 5 });

  expect(
    buildScreenshotModeStatusResponse(
      5,
      screenshotModeState,
      viewportState,
      sendResponse,
      'content-document-5'
    )
  ).toBe(true);

  await Promise.resolve();

  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    documentId: 'content-document-5',
    enabled: true,
    tabId: 5,
    viewport: {
      presetId: 'test:viewport',
      target: 'viewport',
      width: 1440,
      height: 900,
    },
    supported: true,
    surfaceCapabilityToken: surfaceSession.capabilityToken,
    surfaceOperationGeneration: 0,
    unsupportedReason: null,
  });
}

async function verifyUnboundStatusDoesNotClaimCapability() {
  const { buildScreenshotModeStatusResponse } = await import('./status');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const sendResponse = vi.fn();

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });
  beginScreenshotSurfaceSession(5);

  expect(
    buildScreenshotModeStatusResponse(
      5,
      screenshotModeState,
      new Map(),
      sendResponse,
      'content-document-5'
    )
  ).toBe(true);
  await Promise.resolve();

  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    documentId: 'content-document-5',
    enabled: true,
    tabId: 5,
    viewport: null,
    supported: true,
    unsupportedReason: null,
  });
  expect(getScreenshotSurfaceSession(5)).toMatchObject({ documentId: null });
}

async function verifyBuildScreenshotModeStatusReadsLatestState() {
  const { buildScreenshotModeStatusResponse } = await import('./status');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportState = new Map<
    number,
    { presetId: string; target: 'viewport' | 'window'; width: number; height: number } | null
  >([[5, { presetId: 'test:viewport', target: 'viewport' as const, width: 1440, height: 900 }]]);
  const sendResponse = vi.fn();
  const tabLookup = createDeferred<chrome.tabs.Tab>();

  browserTabsGetMock.mockReturnValueOnce(tabLookup.promise);

  expect(
    buildScreenshotModeStatusResponse(
      5,
      screenshotModeState,
      viewportState,
      sendResponse,
      'content-document-5'
    )
  ).toBe(true);

  screenshotModeState.delete(5);
  viewportState.delete(5);
  tabLookup.resolve({ id: 5, url: 'https://example.com' } as chrome.tabs.Tab);
  await Promise.resolve();

  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    documentId: 'content-document-5',
    enabled: false,
    tabId: 5,
    viewport: null,
    supported: true,
    unsupportedReason: null,
  });
}

async function verifyBuildScreenshotModeStatusFallback() {
  const { buildScreenshotModeStatusResponse } = await import('./status');
  const sendResponse = vi.fn();

  browserTabsGetMock.mockRejectedValueOnce(new Error('tab lookup failed'));

  expect(
    buildScreenshotModeStatusResponse(5, new Map(), new Map(), sendResponse, 'content-document-5')
  ).toBe(true);

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    documentId: 'content-document-5',
    enabled: false,
    tabId: 5,
    viewport: null,
    supported: false,
    unsupportedReason: expect.any(String),
  });
}

describe('tab-mode-router-screenshot status responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetScreenshotSurfaceSessionsForTests();
  });

  it(
    'builds a supported status response for the active tab',
    verifyBuildScreenshotModeStatusResponse
  );
  it('keeps unbound status lookup read-only', verifyUnboundStatusDoesNotClaimCapability);
  it(
    'reads the latest tab mode state after asynchronous tab lookup',
    verifyBuildScreenshotModeStatusReadsLatestState
  );
  it(
    'falls back to an unsupported status response when tab lookup fails',
    verifyBuildScreenshotModeStatusFallback
  );
});
