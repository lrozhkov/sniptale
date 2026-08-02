// policyStateId: video-capture-surface-sessions
import { browserTabs } from '@sniptale/platform/browser/tabs';
import { createLogger } from '@sniptale/platform/observability/logger';
import { readTabCaptureViewport } from '../../../capture-viewport';
import { getVideoRecordingTabId } from '../../../session-state';
import { isCurrentNavigationBinding, resolveNavigationBinding } from './binding';
import {
  createExactOutputTransitionId,
  freezeExactOutput,
  serializeExactOutputWork,
  stopAfterCriticalOutputFailure,
  thawExactOutput,
} from './output-transition';
import { revalidateTabSource } from './source-validation';
import {
  isTabNavigationTransactionPending,
  waitForTabNavigationTransactionIdle,
} from './transaction';
import type { NavigationBinding } from './binding';

type ResizeRequest = {
  binding: NavigationBinding;
  revision: number;
  windowId: number;
};

const logger = createLogger({ namespace: 'BackgroundVideoTabResize' });

let drainPromise: Promise<void> | null = null;
let requestRevision = 0;
const latestRevisionByWindowId = new Map<number, number>();
const pendingRequestsByWindowId = new Map<number, ResizeRequest>();
const requestActivityWaiters = new Set<() => void>();

function advanceRequestRevision(windowId: number): number {
  requestRevision += 1;
  latestRevisionByWindowId.set(windowId, requestRevision);
  for (const resolve of requestActivityWaiters) resolve();
  requestActivityWaiters.clear();
  return requestRevision;
}

function isLatestRequest(request: ResizeRequest): boolean {
  return latestRevisionByWindowId.get(request.windowId) === request.revision;
}

function isCurrentRequest(request: ResizeRequest): boolean {
  return isCurrentNavigationBinding(request.binding);
}

async function belongsToRecordingWindow(request: ResizeRequest): Promise<boolean> {
  let tab: chrome.tabs.Tab;
  try {
    tab = await browserTabs.get(request.binding.tabId);
  } catch (error) {
    logger.warn('Failed to resolve the recording tab for a window bounds change', error);
    return false;
  }
  return isCurrentRequest(request) && tab.windowId === request.windowId;
}

async function compensateCriticalFailure(
  request: ResizeRequest,
  transitionId: string,
  error: unknown
): Promise<void> {
  await stopAfterCriticalOutputFailure({
    compensate: () =>
      thawExactOutput({
        binding: request.binding,
        isCurrent: () => isCurrentRequest(request),
        onApplied: () => undefined,
        transitionId,
      }),
    error,
    isCurrent: () => isCurrentRequest(request),
  });
}

async function runResizeTransition(request: ResizeRequest): Promise<void> {
  if (!isCurrentRequest(request)) return;
  let transitionId: string;
  try {
    transitionId = createExactOutputTransitionId(
      'Secure window resize transition generation is unavailable'
    );
  } catch (error) {
    await stopAfterCriticalOutputFailure({
      error,
      isCurrent: () => isCurrentRequest(request),
    });
    return;
  }

  try {
    await freezeExactOutput({
      binding: request.binding,
      isCurrent: () => isCurrentRequest(request),
      onApplied: () => undefined,
      transitionId,
    });
    if (!isCurrentRequest(request)) return;
    const viewport = await readTabCaptureViewport(request.binding.tabId);
    if (!isCurrentRequest(request)) return;
    await revalidateTabSource(request.binding, viewport, transitionId);
    if (!isCurrentRequest(request)) return;
    await thawExactOutput({
      binding: request.binding,
      isCurrent: () => isCurrentRequest(request),
      onApplied: () => undefined,
      transitionId,
    });
    if (!isCurrentRequest(request)) return;
  } catch (error) {
    await compensateCriticalFailure(request, transitionId, error);
  }
}

async function processResizeRequest(request: ResizeRequest): Promise<void> {
  if (!(await belongsToRecordingWindow(request))) return;
  let waitedForNavigation = false;
  while (isTabNavigationTransactionPending()) {
    waitedForNavigation = true;
    let resolveRequestActivity!: () => void;
    const requestActivity = new Promise<void>((resolve) => {
      resolveRequestActivity = resolve;
      requestActivityWaiters.add(resolve);
    });
    await Promise.race([waitForTabNavigationTransactionIdle(), requestActivity]);
    requestActivityWaiters.delete(resolveRequestActivity);
    if (!isCurrentRequest(request) || !isLatestRequest(request)) return;
  }
  if (!isLatestRequest(request)) return;
  if (waitedForNavigation && !(await belongsToRecordingWindow(request))) return;
  await serializeExactOutputWork(() => runResizeTransition(request));
}

async function drainResizeRequests(): Promise<void> {
  while (pendingRequestsByWindowId.size > 0) {
    const request = pendingRequestsByWindowId.values().next().value as ResizeRequest | undefined;
    if (!request) return;
    pendingRequestsByWindowId.delete(request.windowId);
    await processResizeRequest(request);
  }
}

function ensureResizeDrain(): void {
  if (drainPromise) return;
  drainPromise = Promise.resolve()
    .then(drainResizeRequests)
    .catch((error) => logger.error('Unexpected tab resize revalidation failure', error))
    .finally(() => {
      drainPromise = null;
      if (pendingRequestsByWindowId.size > 0) ensureResizeDrain();
    });
}

export function queueTabRecordingWindowBoundsChanged(windowId: number): boolean {
  const tabId = getVideoRecordingTabId();
  const binding = tabId === null ? null : resolveNavigationBinding(tabId);
  if (!binding) return false;
  pendingRequestsByWindowId.set(windowId, {
    binding,
    revision: advanceRequestRevision(windowId),
    windowId,
  });
  ensureResizeDrain();
  return true;
}

export function resetTabRecordingResizeForTests(): void {
  pendingRequestsByWindowId.clear();
  drainPromise = null;
  requestRevision += 1;
  latestRevisionByWindowId.clear();
  for (const resolve of requestActivityWaiters) resolve();
  requestActivityWaiters.clear();
}
