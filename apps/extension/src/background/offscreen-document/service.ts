import { browserOffscreen } from '@sniptale/platform/browser/offscreen';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
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
import { getBackgroundRuntimeMessaging } from '../routing-contracts/runtime-messaging/services';

const logger = createLogger({ namespace: 'BackgroundOffscreenDocument' });
const OFFSCREEN_READINESS_PROBE_TIMEOUT_MS = 5000;
const OFFSCREEN_READY_TIMEOUT_MS = 5000;

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

async function probeExistingOffscreenDocument(offscreenStartupId: string): Promise<boolean> {
  const challenge = createOffscreenStartupId();
  const probe = getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: VideoMessageType.OFFSCREEN_READINESS_PROBE,
      challenge,
      offscreenStartupId,
    })
  );
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('Offscreen readiness probe timed out')),
      OFFSCREEN_READINESS_PROBE_TIMEOUT_MS
    );
  });

  try {
    const response = await Promise.race([probe, timeout]);
    return (
      response.success === true &&
      response.challenge === challenge &&
      response.offscreenStartupId === offscreenStartupId &&
      response.state === 'ready'
    );
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
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

async function runOffscreenDocumentCreation(
  state: OffscreenDocumentState,
  justification: string
): Promise<boolean> {
  if (state.startupFailed) {
    await closeOffscreenDocumentForState(state, 'runtime failure');
  }

  const offscreenUrl = browserRuntime.getURL('apps/extension/src/offscreen/offscreen.html');

  let existingContexts: chrome.runtime.ExtensionContext[] = [];
  try {
    existingContexts = await browserRuntime.getContexts(createOffscreenDocumentContextFilter());
  } catch (error) {
    logger.warn('Failed to inspect runtime contexts before offscreen creation', error);
  }

  if (existingContexts.length > 0) {
    state.offscreenCreated = true;
    state.offscreenReady = false;
    state.startupFailed = false;
    state.expectedStartupId = null;
    const existingStartupId = resolveExistingOffscreenStartupId(existingContexts);
    if (existingStartupId) {
      try {
        if (await probeExistingOffscreenDocument(existingStartupId)) {
          state.expectedStartupId = existingStartupId;
          state.offscreenReady = true;
          logger.debug('Reusing verified ready offscreen document', {
            offscreenStartupId: existingStartupId,
          });
          return false;
        }
      } catch (error) {
        logger.warn('Failed to verify existing offscreen document readiness', error);
      }
    }

    await closeOffscreenDocumentForState(state, 'runtime failure');
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

function ensureOffscreenDocumentForState(
  state: OffscreenDocumentState,
  justification: string
): Promise<boolean> {
  if (state.creationPromise) {
    return state.creationPromise;
  }

  if (state.offscreenCreated && !state.startupFailed) {
    return Promise.resolve(false);
  }

  const creation = runOffscreenDocumentCreation(state, justification);
  let coordinatedCreation: Promise<boolean>;
  coordinatedCreation = creation.then(
    (created) => {
      if (state.creationPromise === coordinatedCreation) {
        state.creationPromise = null;
      }
      return created;
    },
    (error: unknown) => {
      if (!state.offscreenCreated) {
        state.offscreenReady = false;
        state.expectedStartupId = null;
      }
      if (state.creationPromise === coordinatedCreation) {
        state.creationPromise = null;
      }
      throw error;
    }
  );
  state.creationPromise = coordinatedCreation;
  return coordinatedCreation;
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

  function ensureOffscreenDocument(
    justification = 'Run extension-owned offscreen media work'
  ): Promise<boolean> {
    return ensureOffscreenDocumentForState(state, justification);
  }

  function waitForOffscreenReady(timeoutMs = OFFSCREEN_READY_TIMEOUT_MS): Promise<void> {
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

export function ensureOffscreenDocument(
  justification = 'Run extension-owned offscreen media work'
): Promise<boolean> {
  return defaultOffscreenDocumentService.getOwner().ensureOffscreenDocument(justification);
}

export function waitForOffscreenReady(timeoutMs = OFFSCREEN_READY_TIMEOUT_MS): Promise<void> {
  return defaultOffscreenDocumentService.getOwner().waitForOffscreenReady(timeoutMs);
}

export function closeOffscreenDocumentForPrivacyErasure(): Promise<void> {
  return defaultOffscreenDocumentService.getOwner().closeOffscreenDocumentForPrivacyErasure();
}

export function ensurePrivacyErasureOffscreenDocument(): Promise<void> {
  return defaultOffscreenDocumentService.getOwner().ensurePrivacyErasureOffscreenDocument();
}
