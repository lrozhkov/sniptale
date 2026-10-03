import { afterEach, expect, it, vi } from 'vitest';
import { createInitialOffscreenDocumentState } from './state';
import { waitForOffscreenReadyForState, markOffscreenDocumentReadyForState } from './readiness';

const listeners = vi.hoisted(
  () => new Set<(message: unknown, sender: chrome.runtime.MessageSender) => void>()
);
vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: {
    subscribeToMessages: (
      listener: (message: unknown, sender: chrome.runtime.MessageSender) => void
    ) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  },
}));
vi.mock('./sender-policy', () => ({ isTrustedOffscreenRuntimeSender: () => true }));
afterEach(() => {
  listeners.clear();
  vi.useRealTimers();
});

it('keeps a shared startup alive when one caller times out', async () => {
  vi.useFakeTimers();
  const state = createInitialOffscreenDocumentState();
  state.expectedStartupId = 'current';
  const short = waitForOffscreenReadyForState(state, 5_000).catch((error) => error);
  const long = waitForOffscreenReadyForState(state, 30_000);
  await vi.advanceTimersByTimeAsync(5_000);
  expect(await short).toBeInstanceOf(Error);
  expect(state.expectedStartupId).toBe('current');
  expect(state.startupFailed).toBe(false);
  for (const listener of listeners)
    listener({ type: 'OFFSCREEN_READY', offscreenStartupId: 'current' }, {});
  await expect(long).resolves.toBeUndefined();
  expect(listeners.size).toBe(0);
});

it('accepts a late ready signal after the last caller timed out', async () => {
  vi.useFakeTimers();
  const state = createInitialOffscreenDocumentState();
  state.expectedStartupId = 'current';
  const wait = waitForOffscreenReadyForState(state, 5).catch((error) => error);
  await vi.advanceTimersByTimeAsync(5);
  await wait;
  expect(markOffscreenDocumentReadyForState(state, 'current')).toBe(true);
});

it('aborting one caller preserves other waiters and the current startup', async () => {
  const state = createInitialOffscreenDocumentState();
  state.expectedStartupId = 'current';
  const abort = new AbortController();
  const cancelled = waitForOffscreenReadyForState(state, null, abort.signal).catch(
    (error) => error
  );
  const other = waitForOffscreenReadyForState(state, 1000);
  abort.abort();
  expect(await cancelled).toBeInstanceOf(Error);
  for (const listener of listeners)
    listener({ type: 'OFFSCREEN_READY', offscreenStartupId: 'current' }, {});
  await other;
  expect(state.offscreenReady).toBe(true);
});

it('startup replacement rejects old waiters without accepting late READY', async () => {
  const { replaceOffscreenStartup } = await import('./state');
  const state = createInitialOffscreenDocumentState();
  replaceOffscreenStartup(state, 'old');
  const old = waitForOffscreenReadyForState(state, null).catch((error) => error);
  replaceOffscreenStartup(state, 'new');
  expect(await old).toBeInstanceOf(Error);
  expect(markOffscreenDocumentReadyForState(state, 'old')).toBe(false);
  expect(markOffscreenDocumentReadyForState(state, 'new')).toBe(true);
});
