import { browserOffscreen } from '@sniptale/platform/browser/offscreen';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  createOffscreenDocumentContextFilter,
  createPrivacyErasureOffscreenDocumentOptions,
  createUserMediaOffscreenDocumentOptions,
} from './create-options';
import { createInitialOffscreenDocumentState, type OffscreenDocumentState } from './state';
import { markOffscreenDocumentReadyForState, waitForOffscreenReadyForState } from './readiness';
import {
  createOffscreenDocumentUrl,
  createPrivacyErasureOffscreenDocumentUrl,
  createOffscreenStartupId,
  resolveExistingOffscreenStartupId,
} from './startup-id';

const logger = createLogger({ namespace: 'BackgroundOffscreenDocument' });

function resetClosedOffscreenState(state: OffscreenDocumentState): void {
  state.offscreenCreated = false;
  state.offscreenReady = false;
  state.startupFailed = false;
  state.expectedStartupId = null;
}

async function closeOffscreenDocumentForState(
  state: OffscreenDocumentState,
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
  state: OffscreenDocumentState
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
  state: OffscreenDocumentState,
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
  state: OffscreenDocumentState
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

export function createOffscreenDocumentService() {
  const state = createInitialOffscreenDocumentState();

  function hasOffscreenDocument(): boolean {
    return state.offscreenCreated;
  }

  function markOffscreenDocumentReady(offscreenStartupId?: string): boolean {
    return markOffscreenDocumentReadyForState(state, offscreenStartupId);
  }

  async function ensureOffscreenDocument(
    justification = 'Run extension-owned offscreen media work'
  ): Promise<boolean> {
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

const defaultOffscreenDocumentService = createLazyDefaultOwner(createOffscreenDocumentService);

export function hasOffscreenDocument(): boolean {
  return defaultOffscreenDocumentService.getOwner().hasOffscreenDocument();
}

export function markOffscreenDocumentReady(offscreenStartupId?: string): boolean {
  return defaultOffscreenDocumentService.getOwner().markOffscreenDocumentReady(offscreenStartupId);
}

export async function ensureOffscreenDocument(
  justification = 'Run extension-owned offscreen media work'
): Promise<boolean> {
  return defaultOffscreenDocumentService.getOwner().ensureOffscreenDocument(justification);
}

export function waitForOffscreenReady(timeoutMs = 5000): Promise<void> {
  return defaultOffscreenDocumentService.getOwner().waitForOffscreenReady(timeoutMs);
}

export function closeOffscreenDocumentForPrivacyErasure(): Promise<void> {
  return defaultOffscreenDocumentService.getOwner().closeOffscreenDocumentForPrivacyErasure();
}

export function ensurePrivacyErasureOffscreenDocument(): Promise<void> {
  return defaultOffscreenDocumentService.getOwner().ensurePrivacyErasureOffscreenDocument();
}
