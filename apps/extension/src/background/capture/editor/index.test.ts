import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserTabsCreateMock,
  browserTabsGetMock,
  browserTabsQueryMock,
  buildEditorUrlMock,
  createEditorSessionIdMock,
  persistPendingEditorBootstrapPayloadMock,
} = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  browserTabsGetMock: vi.fn(),
  browserTabsQueryMock: vi.fn(),
  buildEditorUrlMock: vi.fn(),
  createEditorSessionIdMock: vi.fn(),
  persistPendingEditorBootstrapPayloadMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: {
    create: browserTabsCreateMock,
    get: browserTabsGetMock,
    query: browserTabsQueryMock,
  },
}));

vi.mock('../../../workflows/editor/bootstrap/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/editor/bootstrap/index')>()),
  persistPendingEditorBootstrapPayload: persistPendingEditorBootstrapPayloadMock,
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: createEditorSessionIdMock,
}));

vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: buildEditorUrlMock,
}));

import { openEditorWithImage, resolveBlobFromPayload } from './index';

function resetEditorMocks() {
  vi.clearAllMocks();
  buildEditorUrlMock.mockReturnValue('chrome-extension://editor');
  createEditorSessionIdMock.mockReturnValue('session-1');
  browserTabsCreateMock.mockResolvedValue({ id: 77 });
}

function useEditorTestScope() {
  beforeEach(() => {
    resetEditorMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
}

describe('capture-editor payload resolution', () => {
  useEditorTestScope();

  it('resolves payload blobs from either base64 or an existing blob', async () => {
    const existingBlob = new Blob(['existing'], { type: 'text/plain' });
    const base64Blob = await resolveBlobFromPayload({
      base64: 'aGVsbG8=',
      mimeType: 'text/plain',
    });

    expect(await base64Blob?.text()).toBe('hello');
    await expect(resolveBlobFromPayload({ blob: existingBlob })).resolves.toBe(existingBlob);
  });

  it('rejects malformed base64 before blob allocation', async () => {
    await expect(
      resolveBlobFromPayload({
        base64: 'not valid base64',
        mimeType: 'application/zip',
      })
    ).rejects.toThrow('Invalid base64 blob payload');
  });
});

describe('capture-editor source tab routing', () => {
  useEditorTestScope();

  it(
    'opens the editor with persisted bootstrap data from the source tab',
    verifySourceTabBootstrapRouting
  );
  it(
    'falls back to the provided source context when tab lookup fails',
    verifySourceContextFallbackRouting
  );
});

async function verifySourceTabBootstrapRouting(): Promise<void> {
  browserTabsGetMock.mockResolvedValue({
    favIconUrl: 'https://example.test/favicon.ico',
    url: 'https://example.test/article',
    title: 'Article',
  });
  persistPendingEditorBootstrapPayloadMock.mockResolvedValue('bootstrap-1');

  await openEditorWithImage('data:image/png;base64,1', { tabId: 42 });

  expect(browserTabsGetMock).toHaveBeenCalledWith(42);
  expect(persistPendingEditorBootstrapPayloadMock).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,1',
    sourceFaviconUrl: 'https://example.test/favicon.ico',
    url: 'https://example.test/article',
    title: 'Article',
  });
  expect(buildEditorUrlMock).toHaveBeenCalledWith({
    bootstrapId: 'bootstrap-1',
    sessionId: 'session-1',
  });
  expect(browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'chrome-extension://editor',
  });
}

async function verifySourceContextFallbackRouting(): Promise<void> {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  browserTabsGetMock.mockRejectedValue(new Error('tab lookup failed'));
  persistPendingEditorBootstrapPayloadMock.mockResolvedValue('bootstrap-2');

  await openEditorWithImage('data:image/png;base64,2', {
    tabId: 99,
    url: 'https://fallback.test',
    title: 'Fallback title',
  });

  expect(persistPendingEditorBootstrapPayloadMock).toHaveBeenCalledWith({
    dataUrl: 'data:image/png;base64,2',
    sourceFaviconUrl: null,
    url: 'https://fallback.test',
    title: 'Fallback title',
  });
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    '[BackgroundCaptureEditor]',
    'Failed to resolve source tab for editor payload',
    expect.any(Error)
  );
}

describe('capture-editor active tab routing', () => {
  useEditorTestScope();

  it('uses the active tab when explicit source metadata is absent', async () => {
    browserTabsQueryMock.mockResolvedValue([
      {
        favIconUrl: 'https://active.test/favicon.ico',
        url: 'https://active.test',
        title: 'Active tab',
      },
    ]);
    persistPendingEditorBootstrapPayloadMock.mockResolvedValue('bootstrap-3');

    await openEditorWithImage('data:image/png;base64,3');

    expect(browserTabsQueryMock).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(persistPendingEditorBootstrapPayloadMock).toHaveBeenCalledWith({
      dataUrl: 'data:image/png;base64,3',
      sourceFaviconUrl: 'https://active.test/favicon.ico',
      url: 'https://active.test',
      title: 'Active tab',
    });
  });
});

describe('capture-editor bootstrap fallback', () => {
  useEditorTestScope();

  it('opens the editor without a runtime-message fallback when bootstrap persistence fails', async () => {
    persistPendingEditorBootstrapPayloadMock.mockRejectedValue(new Error('persist failed'));
    browserTabsQueryMock.mockResolvedValue([
      {
        favIconUrl: 'https://active.test/favicon.ico',
        url: 'https://active.test/fallback',
        title: 'Fallback active tab',
      },
    ]);

    await openEditorWithImage('data:image/png;base64,4');

    expect(buildEditorUrlMock).toHaveBeenCalledWith({
      bootstrapId: null,
      sessionId: 'session-1',
    });
    expect(browserTabsCreateMock).toHaveBeenCalledWith({
      url: 'chrome-extension://editor',
    });
  });
});
