// policyStateIds: [] - this reconstructible quota queue serializes browser effects and grants no capture authority.
import { browserTabs } from '@sniptale/platform/browser/tabs';

const MIN_CAPTURE_INTERVAL_MS = 550;
const CAPTURE_QUOTA_RETRY_DELAY_MS = 1_100;
let queue = Promise.resolve<unknown>(undefined);
let lastCaptureStartedAt: number | null = null;

export type NativeVisibleCaptureLease = {
  capture(
    windowId: number,
    options: chrome.extensionTypes.ImageDetails,
    beforeCapture?: () => Promise<void>
  ): Promise<string>;
};

function wait(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

function now(): number {
  return globalThis.performance.now();
}

function isCaptureQuotaError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.includes('MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND')
  );
}

async function captureAfterGuard(
  windowId: number,
  options: chrome.extensionTypes.ImageDetails,
  beforeCapture?: () => Promise<void>
): Promise<string> {
  await beforeCapture?.();
  lastCaptureStartedAt = now();
  return browserTabs.captureVisibleTab(windowId, options);
}

async function captureRateLimited(
  windowId: number,
  options: chrome.extensionTypes.ImageDetails,
  beforeCapture?: () => Promise<void>
): Promise<string> {
  const remaining =
    lastCaptureStartedAt === null ? 0 : MIN_CAPTURE_INTERVAL_MS - (now() - lastCaptureStartedAt);
  await wait(remaining);
  try {
    return await captureAfterGuard(windowId, options, beforeCapture);
  } catch (error) {
    if (!isCaptureQuotaError(error)) throw error;
    await wait(CAPTURE_QUOTA_RETRY_DELAY_MS);
    return captureAfterGuard(windowId, options, beforeCapture);
  }
}

export function runNativeVisibleCaptureExclusive<T>(
  work: (lease: NativeVisibleCaptureLease) => Promise<T>
): Promise<T> {
  const next = queue
    .catch(() => undefined)
    .then(() =>
      work({
        capture: captureRateLimited,
      })
    );
  queue = next;
  return next;
}

export function resetNativeVisibleCaptureCoordinatorForTests(): void {
  queue = Promise.resolve(undefined);
  lastCaptureStartedAt = null;
}
