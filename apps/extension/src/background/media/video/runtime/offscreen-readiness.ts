import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { OffscreenManagerState } from './offscreen-manager-state';
import { isTrustedOffscreenRuntimeSender } from './sender-policy';

const logger = createLogger({ namespace: 'BackgroundOffscreenManager' });

type ReadyWaitArgs = {
  message: unknown;
  reject: (reason?: unknown) => void;
  resolve: () => void;
  sender: chrome.runtime.MessageSender;
  settledRef: { value: boolean };
  state: OffscreenManagerState;
  timeoutId: ReturnType<typeof setTimeout>;
  unsubscribe: () => void;
};

export function waitForOffscreenReadyForState(
  state: OffscreenManagerState,
  timeoutMs: number
): Promise<void> {
  if (state.offscreenReady) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const settledRef = { value: false };
    const listener = (message: unknown, sender: chrome.runtime.MessageSender) => {
      handleOffscreenReadyWaitMessage({
        message,
        reject,
        resolve,
        sender,
        settledRef,
        state,
        timeoutId,
        unsubscribe,
      });
    };
    const unsubscribe = browserRuntime.subscribeToMessages(listener);
    const timeoutId = setTimeout(() => {
      finalizeWaitForOffscreenReady(timeoutId, unsubscribe, settledRef, () => {
        state.offscreenReady = false;
        state.startupFailed = true;
        state.expectedStartupId = null;
        const error = new Error('Timed out while waiting for offscreen ready signal');
        logger.warn(error.message);
        reject(error);
      });
    }, timeoutMs);
  });
}

export function markOffscreenDocumentReadyForState(
  state: OffscreenManagerState,
  offscreenStartupId?: string
): boolean {
  if (typeof offscreenStartupId === 'string' && state.expectedStartupId === null) {
    logger.warn('Ignoring offscreen ready signal without an active startup', {
      offscreenStartupId,
    });
    return false;
  }

  if (
    typeof state.expectedStartupId === 'string' &&
    offscreenStartupId !== state.expectedStartupId
  ) {
    logger.warn('Ignoring stale offscreen ready signal', {
      expectedStartupId: state.expectedStartupId,
      offscreenStartupId: offscreenStartupId ?? null,
    });
    return false;
  }

  state.offscreenCreated = true;
  state.offscreenReady = true;
  state.startupFailed = false;
  state.expectedStartupId = offscreenStartupId ?? state.expectedStartupId;
  return true;
}

function handleOffscreenReadyWaitMessage(args: ReadyWaitArgs): void {
  if (!isTrustedOffscreenRuntimeSender(args.sender)) {
    return;
  }

  if (isOffscreenReadyMessage(args.message)) {
    resolveTrustedOffscreenReady({ ...args, message: args.message });
    return;
  }

  const errorMessage = args.message;
  if (isOffscreenRuntimeErrorMessage(errorMessage)) {
    rejectTrustedOffscreenReadyError({ ...args, message: errorMessage });
  }
}

function resolveTrustedOffscreenReady(args: ReadyWaitArgs & { message: OffscreenReadyMessage }) {
  if (!isCurrentOffscreenStartupId(args.state, args.message.offscreenStartupId, 'ready')) {
    return;
  }

  finalizeWaitForOffscreenReady(args.timeoutId, args.unsubscribe, args.settledRef, () => {
    args.state.offscreenCreated = true;
    args.state.offscreenReady = true;
    args.state.startupFailed = false;
    logger.debug('Received offscreen ready signal');
    args.resolve();
  });
}

function rejectTrustedOffscreenReadyError(
  args: ReadyWaitArgs & { message: OffscreenRuntimeErrorMessage }
): void {
  if (
    typeof args.message.offscreenStartupId !== 'string' ||
    !isCurrentOffscreenStartupId(args.state, args.message.offscreenStartupId, 'error')
  ) {
    return;
  }

  finalizeWaitForOffscreenReady(args.timeoutId, args.unsubscribe, args.settledRef, () => {
    args.state.offscreenReady = false;
    args.state.startupFailed = true;
    args.state.expectedStartupId = null;
    logger.warn('Offscreen reported a startup failure', {
      error: args.message.error ?? null,
      phase: args.message.phase,
    });
    args.reject(new Error(args.message.error ?? 'Offscreen startup failed'));
  });
}

function finalizeWaitForOffscreenReady(
  timeoutId: ReturnType<typeof setTimeout>,
  unsubscribe: () => void,
  settledRef: { value: boolean },
  effect: () => void
): void {
  if (settledRef.value) {
    return;
  }

  settledRef.value = true;
  clearTimeout(timeoutId);
  unsubscribe();
  effect();
}

type OffscreenReadyMessage = {
  offscreenStartupId: string;
  type: VideoMessageType.OFFSCREEN_READY;
};

type OffscreenRuntimeErrorMessage = {
  error?: string;
  offscreenStartupId?: string;
  phase?: 'runtime';
  type: VideoMessageType.OFFSCREEN_ERROR;
};

function isOffscreenReadyMessage(message: unknown): message is OffscreenReadyMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === VideoMessageType.OFFSCREEN_READY &&
    'offscreenStartupId' in message &&
    typeof message.offscreenStartupId === 'string'
  );
}

function isOffscreenRuntimeErrorMessage(message: unknown): message is OffscreenRuntimeErrorMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === VideoMessageType.OFFSCREEN_ERROR &&
    (!('phase' in message) || message.phase === 'runtime')
  );
}

function isCurrentOffscreenStartupId(
  state: OffscreenManagerState,
  offscreenStartupId: string,
  signal: 'error' | 'ready'
): boolean {
  if (state.expectedStartupId === offscreenStartupId) {
    return true;
  }

  logger.warn(`Ignoring stale offscreen ${signal} signal`, {
    expectedStartupId: state.expectedStartupId,
    offscreenStartupId,
  });
  return false;
}
