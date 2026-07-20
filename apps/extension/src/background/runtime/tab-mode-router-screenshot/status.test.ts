import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1440, height: 900 }],
  ]);
  const sendResponse = vi.fn();

  browserTabsGetMock.mockResolvedValue({ id: 5, url: 'https://example.com' });

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
    viewport: { width: 1440, height: 900 },
    supported: true,
    unsupportedReason: null,
  });
}

async function verifyBuildScreenshotModeStatusReadsLatestState() {
  const { buildScreenshotModeStatusResponse } = await import('./status');
  const screenshotModeState = new Map<number, boolean>([[5, true]]);
  const viewportState = new Map<number, { width: number; height: number } | null>([
    [5, { width: 1440, height: 900 }],
  ]);
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
  });

  it(
    'builds a supported status response for the active tab',
    verifyBuildScreenshotModeStatusResponse
  );
  it(
    'reads the latest tab mode state after asynchronous tab lookup',
    verifyBuildScreenshotModeStatusReadsLatestState
  );
  it(
    'falls back to an unsupported status response when tab lookup fails',
    verifyBuildScreenshotModeStatusFallback
  );
});
