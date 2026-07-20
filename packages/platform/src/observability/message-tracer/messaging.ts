import { getActiveTraceObserver } from './runtime';
import type { TraceConfig, TraceContext, TraceEvent, TraceMessageEvent } from './types';
import { sanitizeHarTracePayload } from './har-payload';
import { sanitizeLlmTracePayload } from './llm-payload';
import { sanitizeRecordingTracePayload } from './recording-payload';
import { sanitizeRuntimeBlobTracePayload } from './runtime-blob-payload';
import { sanitizeTraceErrorText } from './utils';

const trimStaleTimestamps = (map: Map<string, number>): void => {
  if (map.size <= 100) return;
  const excess = map.size - 50;
  const keys = Array.from(map.keys()).slice(0, excess);
  keys.forEach((key) => map.delete(key));
};

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

const createMessageEvent = (
  dir: TraceMessageEvent['dir'],
  payload: unknown,
  params: {
    config: TraceConfig;
    context: TraceContext;
    type: string;
    target: TraceMessageEvent['to'];
    correlationId?: string;
    duration?: number;
    error?: string;
  }
): TraceMessageEvent => {
  return {
    kind: 'msg',
    ts: new Date().toISOString(),
    id: params.correlationId ?? '',
    dir,
    from: params.context,
    to: params.target,
    type: params.type,
    ...(payload === undefined ? {} : { payload }),
    ...(params.duration === undefined ? {} : { duration: params.duration }),
    ...(params.error === undefined ? {} : { error: params.error }),
  };
};

type SendTracker = {
  correlationId: string;
  target: TraceMessageEvent['to'];
  context: TraceContext;
  config: TraceConfig;
  sanitizeValue: (value: unknown, config: TraceConfig) => unknown;
  sendEvent: (event: TraceEvent) => void;
  messageType?: string;
  sendTimestamps: Map<string, number>;
};

export function beginSendTrace(
  message: unknown,
  serializedPayload: unknown,
  target: TraceMessageEvent['to']
): SendTracker | null {
  const observer = getActiveTraceObserver();
  if (!observer) {
    return null;
  }

  const { config, context, sanitizeValue, sendEvent, generateCorrelationId, sendTimestamps } =
    observer;
  if (!config.enabled) return null;

  const messageType = extractMessageType(message);
  if (!messageType) return null;

  const correlationId = generateCorrelationId();
  sendTimestamps.set(correlationId, Date.now());
  trimStaleTimestamps(sendTimestamps);

  const sanitizedPayload = sanitizeValue(
    sanitizeMessageTracePayload(messageType, serializedPayload),
    config
  );

  sendEvent(
    createMessageEvent('send', sanitizedPayload, {
      config,
      context,
      type: messageType,
      target,
      correlationId,
    })
  );

  return {
    correlationId,
    target,
    context,
    config,
    sanitizeValue,
    sendEvent,
    messageType,
    sendTimestamps,
  };
}

export function recordMessageResponse(response: unknown, tracker: SendTracker | null): void {
  if (!tracker || !tracker.messageType) return;

  const { correlationId, config, context, target, sanitizeValue, sendEvent, messageType } = tracker;
  const start = tracker.sendTimestamps.get(correlationId);
  tracker.sendTimestamps.delete(correlationId);

  const sanitizedPayload = sanitizeValue(
    sanitizeMessageTracePayload(messageType, response),
    config
  );

  sendEvent(
    createMessageEvent('recv', sanitizedPayload, {
      config,
      context,
      type: `${messageType}_RESPONSE`,
      target,
      correlationId,
      ...(start ? { duration: Date.now() - start } : {}),
    })
  );
}

export function recordMessageFailure(error: unknown, tracker: SendTracker | null): void {
  if (!tracker || !tracker.messageType) {
    return;
  }

  const { correlationId, config, context, target, sanitizeValue, sendEvent, messageType } = tracker;
  const start = tracker.sendTimestamps.get(correlationId);
  tracker.sendTimestamps.delete(correlationId);

  const sanitizedPayload = sanitizeValue(
    sanitizeMessageTracePayload(messageType, { error: String(error) }),
    config
  );

  sendEvent(
    createMessageEvent('recv', sanitizedPayload, {
      config,
      context,
      type: `${messageType}_RESPONSE`,
      target,
      correlationId,
      ...(start ? { duration: Date.now() - start } : {}),
      error: sanitizeTraceErrorText(error, config),
    })
  );
}

function extractMessageType(message: unknown): string | undefined {
  if (isObjectLike(message) && 'type' in message) {
    return String(Object.getOwnPropertyDescriptor(message, 'type')?.value ?? '');
  }
  return undefined;
}

function sanitizeMessageTracePayload(messageType: string, payload: unknown): unknown {
  return sanitizeRuntimeBlobTracePayload(
    sanitizeRecordingTracePayload(
      messageType,
      sanitizeLlmTracePayload(messageType, sanitizeHarTracePayload(messageType, payload))
    )
  );
}

export function serializeMessagePayload(tabId: number, message: unknown): Record<string, unknown> {
  if (!isObjectLike(message)) {
    return { tabId, value: message };
  }

  return Object.assign({ tabId }, message);
}
