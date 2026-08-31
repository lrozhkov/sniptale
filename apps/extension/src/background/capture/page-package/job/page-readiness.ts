import { browserTabs } from '@sniptale/platform/browser/tabs';
import type { PagePackageCaptureTimingPolicy } from '@sniptale/runtime-contracts/page-package';

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('Popup export cancelled');
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  if (delayMs === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(finish, delayMs);
    function finish() {
      signal.removeEventListener('abort', cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timeoutId);
      reject(abortError(signal));
    }
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

async function waitForComplete(
  tabId: number,
  timeoutMs: number,
  signal: AbortSignal
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let unsubscribeUpdated = () => {};
    let unsubscribeRemoved = () => {};
    const timeoutId = setTimeout(() => finish(new Error('Page load timed out.')), timeoutMs);
    const finish = (error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      unsubscribeUpdated();
      unsubscribeRemoved();
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish(abortError(signal));
    unsubscribeUpdated = browserTabs.subscribeToUpdated((updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
    });
    unsubscribeRemoved = browserTabs.subscribeToRemoved((removedTabId) => {
      if (removedTabId === tabId) finish(new Error('Page was closed before capture.'));
    });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    void browserTabs.get(tabId).then(
      (tab) => {
        if (tab.status === 'complete') finish();
      },
      (error: unknown) => finish(error)
    );
  });
}

export async function waitForPagePackageCaptureReadiness(args: {
  signal: AbortSignal;
  tabId: number;
  timing: PagePackageCaptureTimingPolicy;
}): Promise<void> {
  if (args.signal.aborted) throw abortError(args.signal);
  await waitForComplete(args.tabId, args.timing.loadTimeoutMs, args.signal);
  if (args.signal.aborted) throw abortError(args.signal);
  await abortableDelay(args.timing.settleDelayMs, args.signal);
}
