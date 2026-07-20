import {
  logOffscreenDebugError,
  sendRuntimeMessageBestEffort,
  stringifyOffscreenError,
} from '../runtime-messaging/best-effort';
import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';
import { recordingContext } from '../recording/context';
import {
  isRecordingStartErrorReported,
  unwrapRecordingStartReportedError,
} from '../recording/start/error-reporting';
import {
  type HandledOffscreenRuntimeMessageType,
  handleOffscreenRuntimeMessage,
  isHandledOffscreenRuntimeMessageCandidate,
  parseOffscreenRuntimeMessageOrNull,
  resolveOffscreenErrorPhase,
  resolveOffscreenRuntimeResponseMode,
} from './routing';
import { authorizeOffscreenRuntimeCommand } from './authorization';
import { markOffscreenSideEffectCommand } from './idempotency';

const logger = createLogger({ namespace: 'OffscreenRuntime' });

type ParsedOffscreenRuntimeMessage = Parameters<typeof handleOffscreenRuntimeMessage>[0];

/**
 * Registers the offscreen runtime boundary and routes validated messages into recording/export handlers.
 */
export function registerOffscreenRuntimeMessageListener(): void {
  browserRuntime.subscribeToMessages((message: unknown, sender, sendResponse) => {
    if (!isHandledOffscreenRuntimeMessageCandidate(message)) {
      return;
    }

    const responseHandler = sendResponse as ResponseSender | undefined;
    const commandGate = authorizeOffscreenRuntimeCommand({
      message,
      sender,
      ...(responseHandler === undefined ? {} : { responseHandler }),
    });
    if (!commandGate.authorized) {
      logOffscreenDebugError(
        logger,
        'Rejected unauthorized offscreen runtime message',
        commandGate.reason,
        {
          type: message['type'],
        }
      );
      return responseHandler ? false : undefined;
    }

    const parsedMessage = parseOffscreenRuntimeMessageOrNull({
      logInvalidMessage: (error) =>
        logOffscreenDebugError(logger, 'Ignored invalid offscreen runtime message', error),
      message: commandGate.message,
    });
    if (!parsedMessage) {
      return;
    }

    return routeParsedOffscreenMessage(
      parsedMessage,
      commandGate.capabilityGeneration,
      responseHandler
    );
  });
}

function routeParsedOffscreenMessage(
  parsedMessage: ParsedOffscreenRuntimeMessage,
  capabilityGeneration: string,
  responseHandler?: ResponseSender
): boolean | undefined {
  const responseMode = resolveOffscreenRuntimeResponseMode(parsedMessage.type);
  const idempotency = markOffscreenSideEffectCommand({
    capabilityGeneration,
    message: parsedMessage,
  });
  if (idempotency.duplicate) {
    return routeDuplicateOffscreenCommand(idempotency.completion, responseHandler, responseMode);
  }

  if (responseMode === 'immediate-ack') {
    responseHandler?.({ success: true, result: 'accepted' });
    const work = trackOffscreenRuntimeWork(
      idempotency,
      handleOffscreenRuntimeMessage(parsedMessage, responseHandler)
    );
    void work.catch((error) => {
      reportOffscreenRuntimeError(parsedMessage, error);
    });
    return responseHandler ? false : undefined;
  }

  const work = trackOffscreenRuntimeWork(
    idempotency,
    handleOffscreenRuntimeMessage(parsedMessage, responseHandler)
  );
  void work
    .then(() => {
      if (responseHandler && responseMode === 'deferred-ack') {
        responseHandler({ success: true, result: 'accepted' });
      }
    })
    .catch((error) => {
      if (responseHandler) {
        responseHandler({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        reportOffscreenRuntimeError(parsedMessage, error);
      }
    });
  return responseHandler ? true : undefined;
}

function trackOffscreenRuntimeWork(
  idempotency: ReturnType<typeof markOffscreenSideEffectCommand>,
  work: Promise<void>
): Promise<void> {
  if (idempotency.duplicate) {
    return work;
  }
  return 'tracked' in idempotency ? work : idempotency.completeWith(work);
}

function routeDuplicateOffscreenCommand(
  completion: Promise<void>,
  responseHandler: ResponseSender | undefined,
  responseMode: ReturnType<typeof resolveOffscreenRuntimeResponseMode>
): boolean | undefined {
  if (responseMode === 'immediate-ack') {
    responseHandler?.({ success: true, result: 'accepted' });
    return responseHandler ? false : undefined;
  }

  void completion.then(
    () => {
      responseHandler?.({ success: true, result: 'accepted' });
    },
    (error) => {
      responseHandler?.({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  );
  return responseHandler ? true : undefined;
}

function reportOffscreenRuntimeError(message: ParsedOffscreenRuntimeMessage, error: unknown): void {
  const type = message.type;
  if (type === MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE) {
    logOffscreenDebugError(logger, 'Offscreen page storage privacy erasure failed', error, {
      type,
    });
    return;
  }
  if (type === VideoMessageType.OFFSCREEN_START_RECORDING) {
    reportOffscreenStartRuntimeError(message, error);
    return;
  }

  const normalizedError = stringifyOffscreenError(error);
  const recordingId = resolveRecordingScopedErrorRecordingId(type);
  logOffscreenDebugError(logger, 'Offscreen runtime message failed', error, { type });
  sendRuntimeMessageBestEffort({
    context: {
      type,
      ...(recordingId === null ? {} : { recordingId }),
    },
    logger,
    logMessage: 'Failed to notify runtime about offscreen runtime failure',
    payload: {
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: normalizedError,
      phase: resolveOffscreenErrorPhase(type),
      ...(recordingId === null ? {} : { recordingId }),
    },
  });
}

function reportOffscreenStartRuntimeError(
  message: Extract<
    ParsedOffscreenRuntimeMessage,
    { type: typeof VideoMessageType.OFFSCREEN_START_RECORDING }
  >,
  error: unknown
): void {
  if (isRecordingStartErrorReported(error)) {
    logOffscreenDebugError(
      logger,
      'Offscreen runtime start message failed after local reporting',
      unwrapRecordingStartReportedError(error),
      { type: message.type }
    );
    return;
  }

  const normalizedError = stringifyOffscreenError(error);
  logOffscreenDebugError(
    logger,
    'Offscreen runtime start message failed before local reporting',
    error,
    { type: message.type }
  );
  sendRuntimeMessageBestEffort({
    context: { recordingId: message.recordingId ?? null, type: message.type },
    logger,
    logMessage: 'Failed to notify runtime about offscreen recording start failure',
    payload: {
      type: VideoMessageType.OFFSCREEN_ERROR,
      error: normalizedError,
      phase: 'start',
      ...(message.recordingId === undefined ? {} : { recordingId: message.recordingId }),
    },
  });
}

function resolveRecordingScopedErrorRecordingId(
  type: HandledOffscreenRuntimeMessageType
): string | null {
  if (
    type === VideoMessageType.OFFSCREEN_STOP_RECORDING ||
    type === VideoMessageType.OFFSCREEN_PAUSE_RECORDING ||
    type === VideoMessageType.OFFSCREEN_RESUME_RECORDING
  ) {
    return recordingContext.currentRecordingId;
  }

  return null;
}
