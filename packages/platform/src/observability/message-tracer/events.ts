import type { TraceTransport } from './transport';
import type { TraceConfig, TraceContext, TraceEvent, TraceMessageEvent } from './types';
import { sanitizeLlmTracePayload } from './llm-payload';

interface TraceStatsSnapshot {
  isConnected: boolean;
  queueSize: number;
  droppedEventCount: number;
  context: TraceContext;
  enabled: boolean;
  timestampsCount: number;
}

export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function consumeSendDuration(
  sendTimestamps: Map<string, number>,
  correlationId?: string,
  now = Date.now()
): number | undefined {
  if (!correlationId || !sendTimestamps.has(correlationId)) {
    return undefined;
  }

  const startedAt = sendTimestamps.get(correlationId) ?? now;
  sendTimestamps.delete(correlationId);
  return now - startedAt;
}

export function createTraceMessageEvent(params: {
  currentContext: TraceContext;
  dir: TraceMessageEvent['dir'];
  type: string;
  target: TraceMessageEvent['to'];
  payload: unknown;
  from?: TraceContext;
  correlationId?: string;
  duration?: number;
  error?: string;
  now?: string;
  generateId?: () => string;
}): TraceMessageEvent {
  const generateId = params.generateId ?? generateCorrelationId;

  return {
    kind: 'msg',
    ts: params.now ?? new Date().toISOString(),
    id: params.correlationId ?? generateId(),
    dir: params.dir,
    from: params.from ?? params.currentContext,
    to: params.target,
    type: params.type,
    ...(params.payload === undefined ? {} : { payload: params.payload }),
    ...(params.duration === undefined ? {} : { duration: params.duration }),
    ...(params.error === undefined ? {} : { error: params.error }),
  };
}

export function createTraceStatsSnapshot(params: {
  transport: TraceTransport | null;
  context: TraceContext;
  enabled: boolean;
  sendTimestamps: Map<string, number>;
}): TraceStatsSnapshot {
  return {
    isConnected: params.transport?.isConnected() ?? false,
    queueSize: params.transport?.getQueueSize() ?? 0,
    droppedEventCount: params.transport?.getDroppedEventCount() ?? 0,
    context: params.context,
    enabled: params.enabled,
    timestampsCount: params.sendTimestamps.size,
  };
}

export function createTraceSendResponseWrapper(params: {
  messageType: string;
  sender: chrome.runtime.MessageSender;
  config: TraceConfig;
  context: TraceContext;
  sendEvent: (event: TraceEvent) => void;
  sanitizeValue: (value: unknown, config: TraceConfig) => unknown;
  now?: () => number;
}): (response: unknown) => void {
  const now = params.now ?? (() => Date.now());
  const sendTime = now();

  return (response: unknown) => {
    if (!params.config.enabled) {
      return;
    }

    const payload = params.sanitizeValue(
      sanitizeLlmTracePayload(params.messageType, response),
      params.config
    );
    const duration = now() - sendTime;

    params.sendEvent(
      createTraceMessageEvent({
        currentContext: params.context,
        dir: 'send',
        type: `${params.messageType}_RESPONSE`,
        target: params.sender.tab ? 'cs' : 'bg',
        payload,
        duration,
      })
    );
  };
}
