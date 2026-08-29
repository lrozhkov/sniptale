import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  updated: null as ((tabId: number, info: { status?: string }) => void) | null,
  removed: null as ((tabId: number) => void) | null,
  subscribeUpdated: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: {
    get: mocks.get,
    subscribeToUpdated: mocks.subscribeUpdated,
    subscribeToRemoved: vi.fn((listener) => {
      mocks.removed = listener;
      return vi.fn();
    }),
  },
}));

import { waitForPagePackageCaptureReadiness } from './page-readiness';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.updated = null;
  mocks.removed = null;
  mocks.subscribeUpdated.mockImplementation((listener) => {
    mocks.updated = listener;
    return vi.fn();
  });
});

it('waits for complete and the configured settle delay', async () => {
  mocks.get.mockResolvedValue({ id: 7, status: 'loading' });
  const pending = waitForPagePackageCaptureReadiness({
    signal: new AbortController().signal,
    tabId: 7,
    timing: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
  });
  await vi.waitFor(() => expect(mocks.updated).not.toBeNull());
  mocks.updated?.(7, { status: 'complete' });
  await vi.advanceTimersByTimeAsync(1_999);
  let settled = false;
  void pending.then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toBeUndefined();
});

it('returns immediately when the page is already complete and no delay is configured', async () => {
  mocks.get.mockResolvedValue({ id: 7, status: 'complete' });
  await expect(
    waitForPagePackageCaptureReadiness({
      signal: new AbortController().signal,
      tabId: 7,
      timing: { loadTimeoutMs: 5_000, settleDelayMs: 0 },
    })
  ).resolves.toBeUndefined();
});

it('fails when a waiting page is closed', async () => {
  mocks.get.mockResolvedValue({ id: 7, status: 'loading' });
  const pending = waitForPagePackageCaptureReadiness({
    signal: new AbortController().signal,
    tabId: 7,
    timing: { loadTimeoutMs: 30_000, settleDelayMs: 0 },
  });
  const rejection = expect(pending).rejects.toThrow('Page was closed');
  await vi.waitFor(() => expect(mocks.removed).not.toBeNull());
  mocks.removed?.(7);
  await rejection;
});

it('surfaces a tab lookup failure after subscriptions are established', async () => {
  mocks.get.mockRejectedValueOnce(new Error('tab unavailable'));
  await expect(
    waitForPagePackageCaptureReadiness({
      signal: new AbortController().signal,
      tabId: 7,
      timing: { loadTimeoutMs: 30_000, settleDelayMs: 0 },
    })
  ).rejects.toThrow('tab unavailable');
});

it('cancels during the post-load settle delay', async () => {
  mocks.get.mockResolvedValue({ id: 7, status: 'complete' });
  const controller = new AbortController();
  const pending = waitForPagePackageCaptureReadiness({
    signal: controller.signal,
    tabId: 7,
    timing: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
  });
  const rejection = expect(pending).rejects.toThrow('settle cancelled');
  await vi.advanceTimersByTimeAsync(0);
  controller.abort(new Error('settle cancelled'));
  await rejection;
});

it('does not begin browser work for an already-cancelled job', async () => {
  const controller = new AbortController();
  controller.abort(new Error('already cancelled'));
  await expect(
    waitForPagePackageCaptureReadiness({
      signal: controller.signal,
      tabId: 7,
      timing: { loadTimeoutMs: 30_000, settleDelayMs: 0 },
    })
  ).rejects.toThrow('already cancelled');
  expect(mocks.get).not.toHaveBeenCalled();
});

it('times out a page without blocking later pages', async () => {
  mocks.get.mockResolvedValue({ id: 7, status: 'loading' });
  const pending = waitForPagePackageCaptureReadiness({
    signal: new AbortController().signal,
    tabId: 7,
    timing: { loadTimeoutMs: 5_000, settleDelayMs: 0 },
  });
  const rejection = expect(pending).rejects.toThrow('Page load timed out');
  await vi.advanceTimersByTimeAsync(5_000);
  await rejection;
});

it('stops immediately on cancellation', async () => {
  mocks.get.mockResolvedValue({ id: 7, status: 'loading' });
  const controller = new AbortController();
  const pending = waitForPagePackageCaptureReadiness({
    signal: controller.signal,
    tabId: 7,
    timing: { loadTimeoutMs: 30_000, settleDelayMs: 0 },
  });
  await vi.waitFor(() => expect(mocks.updated).not.toBeNull());
  controller.abort(new Error('cancelled'));
  await expect(pending).rejects.toThrow('cancelled');
});

it('observes completion that happens while the initial tab read is pending', async () => {
  let resolveGet!: (tab: { id: number; status: string }) => void;
  mocks.get.mockImplementationOnce(
    () => new Promise((resolve) => (resolveGet = resolve as typeof resolveGet))
  );
  const pending = waitForPagePackageCaptureReadiness({
    signal: new AbortController().signal,
    tabId: 7,
    timing: { loadTimeoutMs: 30_000, settleDelayMs: 0 },
  });
  await vi.waitFor(() => expect(mocks.updated).not.toBeNull());
  mocks.updated?.(7, { status: 'complete' });
  resolveGet({ id: 7, status: 'loading' });
  await expect(pending).resolves.toBeUndefined();
});

it('observes cancellation that happens while the initial tab read is pending', async () => {
  mocks.get.mockImplementationOnce(() => new Promise(() => undefined));
  const controller = new AbortController();
  const pending = waitForPagePackageCaptureReadiness({
    signal: controller.signal,
    tabId: 7,
    timing: { loadTimeoutMs: 30_000, settleDelayMs: 0 },
  });
  await vi.waitFor(() => expect(mocks.updated).not.toBeNull());
  controller.abort(new Error('gap cancelled'));
  await expect(pending).rejects.toThrow('gap cancelled');
});

it('observes cancellation that occurs while readiness listeners are being installed', async () => {
  const controller = new AbortController();
  mocks.subscribeUpdated.mockImplementationOnce((listener) => {
    mocks.updated = listener;
    controller.abort(new Error('subscription cancelled'));
    return vi.fn();
  });
  await expect(
    waitForPagePackageCaptureReadiness({
      signal: controller.signal,
      tabId: 7,
      timing: { loadTimeoutMs: 30_000, settleDelayMs: 0 },
    })
  ).rejects.toThrow('subscription cancelled');
  expect(mocks.get).not.toHaveBeenCalled();
});
