import { browserOffscreen } from '@sniptale/platform/browser/offscreen';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createOffscreenDocumentContextFilter,
  createPrivacyErasureOffscreenDocumentOptions,
  createUserMediaOffscreenDocumentOptions,
} from './offscreen-document-dto';
import {
  createInitialOffscreenManagerState,
  type OffscreenManagerState,
} from './offscreen-manager-state';
import {
  markOffscreenDocumentReadyForState,
  waitForOffscreenReadyForState,
} from './offscreen-readiness';
import {
  createOffscreenDocumentUrl,
  createPrivacyErasureOffscreenDocumentUrl,
  createOffscreenStartupId,
  resolveExistingOffscreenStartupId,
} from './offscreen-startup-id';

const logger = createLogger({ namespace: 'BackgroundOffscreenManager' });

function resetClosedOffscreenState(state: OffscreenManagerState): void {
  state.offscreenCreated = false;
  state.offscreenReady = false;
  state.startupFailed = false;
  state.expectedStartupId = null;
}

async function closeOffscreenDocumentForState(
  state: OffscreenManagerState,
  reason: 'runtime failure' | 'timeout'
): Promise<void> {
  try {
    await browserOffscreen.closeDocument();
    logger.warn('Closed failed offscreen document', { reason });
    resetClosedOffscreenState(state);
  } catch (error) {
    state.offscreenReady = false;
    state.startupFailed = true;
    logger.warn('Failed to close offscreen document after startup failure', {
      error,
      reason,
    });
    throw error;
  }
}

async function closeOffscreenDocumentForPrivacyErasureForState(
  state: OffscreenManagerState
): Promise<void> {
  const contextFilter = createOffscreenDocumentContextFilter();
  const existingContexts = await browserRuntime.getContexts(contextFilter);
  if (existingContexts.length === 0) {
    resetClosedOffscreenState(state);
    return;
  }

  await browserOffscreen.closeDocument();
  const remainingContexts = await browserRuntime.getContexts(contextFilter);
  if (remainingContexts.length > 0) {
    throw new Error('Offscreen document remained active after local data erasure close');
  }

  resetClosedOffscreenState(state);
  logger.log('Closed offscreen document for local data erasure');
}

async function ensureOffscreenDocumentForState(
  state: OffscreenManagerState,
  justification: string
): Promise<boolean> {
  if (state.offscreenCreated && !state.startupFailed) {
    return false;
  }

  if (state.startupFailed) {
    await closeOffscreenDocumentForState(state, 'runtime failure');
  }

  const offscreenUrl = browserRuntime.getURL('apps/extension/src/offscreen/offscreen.html');

  try {
    const existingContexts = await browserRuntime.getContexts(
      createOffscreenDocumentContextFilter()
    );

    if (existingContexts.length > 0) {
      state.offscreenCreated = true;
      state.offscreenReady = true;
      state.startupFailed = false;
      state.expectedStartupId = resolveExistingOffscreenStartupId(existingContexts);
      logger.debug('Reusing existing ready offscreen document', {
        offscreenStartupId: state.expectedStartupId,
      });
      return false;
    }
  } catch (error) {
    logger.warn('Failed to inspect runtime contexts before offscreen creation', error);
  }

  const offscreenStartupId = createOffscreenStartupId();
  state.expectedStartupId = offscreenStartupId;
  state.offscreenReady = false;
  await browserOffscreen.createDocument(
    createUserMediaOffscreenDocumentOptions(
      createOffscreenDocumentUrl(offscreenUrl, offscreenStartupId),
      justification
    )
  );

  state.offscreenCreated = true;
  state.startupFailed = false;
  logger.log('Created offscreen document');
  return true;
}

async function ensurePrivacyErasureOffscreenDocumentForState(
  state: OffscreenManagerState
): Promise<void> {
  if (state.offscreenCreated) {
    throw new Error('Privacy erasure requires an isolated offscreen document');
  }

  const existingContexts = await browserRuntime.getContexts(createOffscreenDocumentContextFilter());
  if (existingContexts.length > 0) {
    throw new Error('Privacy erasure offscreen document isolation is unavailable');
  }

  const offscreenStartupId = createOffscreenStartupId();
  const offscreenUrl = browserRuntime.getURL('apps/extension/src/offscreen/offscreen.html');
  state.expectedStartupId = offscreenStartupId;
  state.offscreenReady = false;
  await browserOffscreen.createDocument(
    createPrivacyErasureOffscreenDocumentOptions(
      createPrivacyErasureOffscreenDocumentUrl(offscreenUrl, offscreenStartupId)
    )
  );
  state.offscreenCreated = true;
  state.startupFailed = false;
  logger.log('Created isolated offscreen document for local data erasure');
}

export function createOffscreenManagerService() {
  const state = createInitialOffscreenManagerState();

  function hasOffscreenDocument(): boolean {
    return state.offscreenCreated;
  }

  function markOffscreenDocumentReady(offscreenStartupId?: string): boolean {
    return markOffscreenDocumentReadyForState(state, offscreenStartupId);
  }

  async function ensureOffscreenDocument(justification = 'Recording tab video'): Promise<boolean> {
    return ensureOffscreenDocumentForState(state, justification);
  }

  function waitForOffscreenReady(timeoutMs = 5000): Promise<void> {
    return waitForOffscreenReadyForState(state, timeoutMs);
  }

  function closeOffscreenDocumentForPrivacyErasure(): Promise<void> {
    return closeOffscreenDocumentForPrivacyErasureForState(state);
  }

  async function ensurePrivacyErasureOffscreenDocument(): Promise<void> {
    await ensurePrivacyErasureOffscreenDocumentForState(state);
    await waitForOffscreenReadyForState(state, 5000);
  }

  return {
    closeOffscreenDocumentForPrivacyErasure,
    ensurePrivacyErasureOffscreenDocument,
    hasOffscreenDocument,
    markOffscreenDocumentReady,
    ensureOffscreenDocument,
    waitForOffscreenReady,
  };
}

const defaultOffscreenManagerService = createLazyDefaultOwner(createOffscreenManagerService);

export function hasOffscreenDocument(): boolean {
  return defaultOffscreenManagerService.getOwner().hasOffscreenDocument();
}

export function markOffscreenDocumentReady(offscreenStartupId?: string): boolean {
  return defaultOffscreenManagerService.getOwner().markOffscreenDocumentReady(offscreenStartupId);
}

export async function ensureOffscreenDocument(
  justification = 'Recording tab video'
): Promise<boolean> {
  return defaultOffscreenManagerService.getOwner().ensureOffscreenDocument(justification);
}

export function waitForOffscreenReady(timeoutMs = 5000): Promise<void> {
  return defaultOffscreenManagerService.getOwner().waitForOffscreenReady(timeoutMs);
}

export function closeOffscreenDocumentForPrivacyErasure(): Promise<void> {
  return defaultOffscreenManagerService.getOwner().closeOffscreenDocumentForPrivacyErasure();
}

export function ensurePrivacyErasureOffscreenDocument(): Promise<void> {
  return defaultOffscreenManagerService.getOwner().ensurePrivacyErasureOffscreenDocument();
}
