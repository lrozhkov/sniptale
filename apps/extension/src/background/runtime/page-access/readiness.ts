import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../routing-contracts/runtime-messaging/services';
import { injectContentRuntime } from './registration';
import type { SupportedPageTarget } from './target';

const CONTENT_RUNTIME_READY_MAX_ATTEMPTS = 40;
const CONTENT_RUNTIME_READY_RETRY_DELAY_MS = 50;
type RuntimeReadinessDeps = {
  sendTabMessage: ReturnType<typeof getBackgroundRuntimeMessaging>['sendTabMessage'];
  wait: (delayMs: number) => Promise<void>;
};

const defaultReadinessDeps: RuntimeReadinessDeps = {
  sendTabMessage: (tabId, message) =>
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, message),
  wait: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasViewportProbePayload(response: unknown): boolean {
  if (!isObject(response)) {
    return false;
  }

  return isObject(response['coords']) || isObject(response['viewport']);
}

async function waitForContentRuntimeReadyAttempt(
  tabId: number,
  deps: RuntimeReadinessDeps
): Promise<boolean> {
  try {
    const response = await deps.sendTabMessage(tabId, {
      type: VideoMessageType.GET_VIEWPORT_COORDS,
    });
    return hasViewportProbePayload(response);
  } catch {
    return false;
  }
}

export async function waitForContentRuntimeReady(
  tabId: number,
  deps: Partial<RuntimeReadinessDeps> = {}
): Promise<void> {
  const resolvedDeps = { ...defaultReadinessDeps, ...deps };

  for (let attempt = 1; attempt <= CONTENT_RUNTIME_READY_MAX_ATTEMPTS; attempt += 1) {
    if (await waitForContentRuntimeReadyAttempt(tabId, resolvedDeps)) {
      return;
    }

    if (attempt < CONTENT_RUNTIME_READY_MAX_ATTEMPTS) {
      await resolvedDeps.wait(CONTENT_RUNTIME_READY_RETRY_DELAY_MS);
    }
  }

  throw new Error('Content runtime did not become ready after injection.');
}

export async function injectContentRuntimeAndAwaitReady(
  target: SupportedPageTarget,
  options: { allFrames: boolean }
): Promise<void> {
  await injectContentRuntime(target, options);
  await waitForContentRuntimeReady(target.tabId);
}
