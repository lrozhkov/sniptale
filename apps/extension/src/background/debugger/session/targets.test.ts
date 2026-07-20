import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureHttpUrl,
  fetchDebuggerTargets,
  rejectExtensionConflict,
  resolveTabInfo,
  selectPageTarget,
  sendDevtoolsConflictToast,
  waitForTabReady,
  type DebuggerTarget,
} from './targets';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const {
  browserDebuggerMock,
  browserTabsMock,
  loggerDebugMock,
  loggerErrorMock,
  sendTabMessageMock,
  translateMock,
  withTimeoutMock,
} = vi.hoisted(() => ({
  browserDebuggerMock: {
    getTargets: vi.fn(),
  },
  browserTabsMock: {
    get: vi.fn(),
    subscribeToUpdated: vi.fn(),
  },
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  sendTabMessageMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
  withTimeoutMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/debugger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/debugger')>()),
  browserDebugger: browserDebuggerMock,
}));

vi.mock('@sniptale/platform/browser/tabs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/tabs')>()),
  browserTabs: browserTabsMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendTabMessage: (...args: unknown[]) => sendTabMessageMock(...args),
}));

vi.mock('../infra', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infra')>()),
  withTimeout: withTimeoutMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  browserDebuggerMock.getTargets.mockResolvedValue([]);
  browserTabsMock.get.mockResolvedValue({
    id: 1,
    status: 'complete',
    url: 'https://example.com',
  });
  browserTabsMock.subscribeToUpdated.mockReturnValue(vi.fn());
  withTimeoutMock.mockImplementation((promise: Promise<unknown>) => promise);
});

describe('debugger-session-targets conflict helpers', () => {
  it('rejects extension-owned debugger conflicts for the first client', async () => {
    const targets: DebuggerTarget[] = [
      { attached: true, url: 'chrome-extension://abc/panel.html' },
      { attached: true, url: 'https://example.com' },
    ];

    await expect(rejectExtensionConflict(true, targets)).rejects.toBeInstanceOf(Error);
  });

  it('ignores non-extension conflicts and non-first clients', async () => {
    await expect(
      rejectExtensionConflict(false, [{ attached: true, url: 'chrome-extension://abc/panel.html' }])
    ).resolves.toBeUndefined();
    await expect(
      rejectExtensionConflict(true, [{ attached: true, url: 'https://example.com' }])
    ).resolves.toBeUndefined();
  });

  it('sends a typed conflict toast to the tab', async () => {
    sendTabMessageMock.mockResolvedValue({});

    await sendDevtoolsConflictToast(12);

    expect(sendTabMessageMock).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        type: MessageType.SHOW_TOAST,
        payload: expect.objectContaining({
          type: 'error',
        }),
      })
    );
  });
});

describe('debugger-session-targets tab resolution', () => {
  it('resolves tab info through the shared tabs adapter', async () => {
    const tab = { id: 5, url: 'https://example.com' };
    browserTabsMock.get.mockResolvedValue(tab);

    await expect(resolveTabInfo(5)).resolves.toBe(tab);
    expect(browserTabsMock.get).toHaveBeenCalledWith(5);
    expect(loggerDebugMock).toHaveBeenCalledWith('Resolved tab info', { tabId: 5, hasUrl: true });
  });

  it('maps tab lookup failures to a stable debugger-attach error', async () => {
    browserTabsMock.get.mockRejectedValue(new Error('tab missing'));

    await expect(resolveTabInfo(5)).rejects.toThrow('Failed to get tab info');
    expect(loggerErrorMock).toHaveBeenCalledWith('Failed to get tab info', expect.any(Error));
  });

  it('waits for a loading tab to complete and unsubscribes the listener', async () => {
    vi.useFakeTimers();
    let updatedListener:
      | ((updatedTabId: number, changeInfo: { status?: string }) => void)
      | undefined;
    const unsubscribe = vi.fn();

    browserTabsMock.subscribeToUpdated.mockImplementation((listener: typeof updatedListener) => {
      updatedListener = listener ?? undefined;
      return unsubscribe;
    });

    const readyPromise = waitForTabReady(9, { status: 'loading' } as chrome.tabs.Tab);
    updatedListener?.(9, { status: 'complete' });
    await readyPromise;

    expect(unsubscribe).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('returns immediately for tabs that are already ready', async () => {
    await waitForTabReady(9, { status: 'complete' } as chrome.tabs.Tab);
    expect(browserTabsMock.subscribeToUpdated).not.toHaveBeenCalled();
  });
});

describe('debugger-session-targets tab readiness timeout', () => {
  it('stops waiting for a loading tab after the fallback timeout', async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn();
    browserTabsMock.subscribeToUpdated.mockReturnValue(unsubscribe);

    const readyPromise = waitForTabReady(9, { status: 'loading' } as chrome.tabs.Tab);
    await vi.advanceTimersByTimeAsync(5000);
    await readyPromise;

    expect(unsubscribe).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

describe('debugger-session-targets url guards', () => {
  it('accepts HTTP and HTTPS URLs for debugger attach', () => {
    expect(() => ensureHttpUrl({ url: 'https://example.com' } as chrome.tabs.Tab)).not.toThrow();
    expect(() => ensureHttpUrl({ url: 'http://example.com' } as chrome.tabs.Tab)).not.toThrow();
  });

  it('rejects non-http tabs before debugger attach', () => {
    expect(() => ensureHttpUrl({ url: 'chrome://extensions' } as chrome.tabs.Tab)).toThrow(
      'Debugger can only be attached to HTTP/HTTPS pages.'
    );
  });
});

describe('debugger-session-targets debugger resolution', () => {
  it('fetches debugger targets through the timeout wrapper and filters by tab id', async () => {
    const targets = [
      { tabId: 3, attached: true },
      { tabId: 7, attached: false },
      { tabId: 7, attached: true },
    ];
    browserDebuggerMock.getTargets.mockResolvedValue(targets);

    await expect(fetchDebuggerTargets(7)).resolves.toEqual({
      targets,
      tabTargets: [targets[1], targets[2]],
    });
    expect(withTimeoutMock).toHaveBeenCalledWith(
      expect.any(Promise),
      expect.any(Number),
      'debugger.getTargets'
    );
  });

  it('selects the page target for the requested tab', () => {
    const targets: DebuggerTarget[] = [
      { id: 'other', tabId: 1, type: 'page', url: 'https://other.example' },
      { id: 'main', tabId: 5, type: 'page', url: 'https://example.com' },
    ];

    expect(selectPageTarget(5, targets, targets)).toEqual(targets[1]);
  });

  it('throws when no page target matches the requested tab', () => {
    expect(() =>
      selectPageTarget(
        7,
        [{ id: 'worker-1', tabId: 7, type: 'worker', url: 'https://example.com/worker.js' }],
        [{ id: 'worker-1', tabId: 7, type: 'worker', url: 'https://example.com/worker.js' }]
      )
    ).toThrow('No HTTP/HTTPS page target found for tabId 7.');
  });
});
