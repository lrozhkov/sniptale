import type { TraceClientMessage, TraceConfig, TraceContext, TraceEvent } from './types';
import { safeStringify } from './utils';

export type TraceTransport = {
  connect: () => void;
  disconnect: () => void;
  sendEvent: (event: TraceEvent) => void;
  flushQueue: () => void;
  clearQueue: () => void;
  isConnected: () => boolean;
  getDroppedEventCount: () => number;
  getQueueSize: () => number;
};

export function createTraceTransport(config: TraceConfig, context: TraceContext): TraceTransport {
  const state = createTraceTransportState();

  return {
    connect: () => connectTransport(state, config, context),
    disconnect: () => disconnectTransport(state),
    sendEvent: (event) => queueEvent(state, config, event),
    flushQueue: () => flushQueuedEvents(state, config),
    clearQueue: () => clearQueue(state),
    isConnected: () => state.isConnected,
    getDroppedEventCount: () => state.droppedEventCount,
    getQueueSize: () => state.messageQueue.length,
  };
}

type TraceTransportState = {
  disconnectRequested: boolean;
  ws: WebSocket | null;
  isConnected: boolean;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  droppedEventCount: number;
  messageQueue: TraceEvent[];
  batchTimeout: ReturnType<typeof setTimeout> | null;
};

function createTraceTransportState(): TraceTransportState {
  return {
    disconnectRequested: false,
    ws: null,
    isConnected: false,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    droppedEventCount: 0,
    messageQueue: [],
    batchTimeout: null,
  };
}

function clearReconnectTimeout(state: TraceTransportState): void {
  if (!state.reconnectTimeout) {
    return;
  }

  clearTimeout(state.reconnectTimeout);
  state.reconnectTimeout = null;
}

function scheduleBatch(state: TraceTransportState, config: TraceConfig): void {
  if (state.batchTimeout) return;
  state.batchTimeout = setTimeout(() => {
    state.batchTimeout = null;
    flushBatch(state, config);
  }, config.batchInterval);
}

function flushBatch(state: TraceTransportState, config: TraceConfig): void {
  if (!state.isConnected || !state.ws || state.messageQueue.length === 0) return;

  const batch = state.messageQueue.splice(0, config.batchSize);

  for (const event of batch) {
    try {
      (state.ws as WebSocket).send(safeStringify({ event } satisfies TraceClientMessage, config));
    } catch {
      state.messageQueue.unshift(event);
      break;
    }
  }

  if (state.messageQueue.length > 0) {
    scheduleBatch(state, config);
  }
}

function flushQueuedEvents(state: TraceTransportState, config: TraceConfig): void {
  if (!state.isConnected || !state.ws || state.messageQueue.length === 0) return;
  if (state.batchTimeout) {
    clearTimeout(state.batchTimeout);
    state.batchTimeout = null;
  }

  while (state.messageQueue.length > 0 && state.isConnected && state.ws) {
    const event = state.messageQueue.shift();
    if (!event) continue;
    try {
      (state.ws as WebSocket).send(safeStringify({ event } satisfies TraceClientMessage, config));
    } catch {
      state.messageQueue.unshift(event);
      break;
    }
  }
}

function queueEvent(state: TraceTransportState, config: TraceConfig, event: TraceEvent): void {
  if (!config.enabled) {
    return;
  }

  state.messageQueue.push(event);

  if (state.messageQueue.length > config.maxBufferSize) {
    const overflowCount = state.messageQueue.length - config.maxBufferSize;
    state.messageQueue = state.messageQueue.slice(-config.maxBufferSize);
    state.droppedEventCount += overflowCount;
  }

  if (!state.isConnected || !state.ws) {
    return;
  }

  scheduleBatch(state, config);
}

function handleTransportOpen(
  state: TraceTransportState,
  config: TraceConfig,
  context: TraceContext
): void {
  state.isConnected = true;
  state.reconnectAttempts = 0;
  clearReconnectTimeout(state);

  if (state.ws && context === 'bg') {
    try {
      (state.ws as WebSocket).send(safeStringify({ command: 'clear' }, config));
    } catch {
      // ignore
    }
  }

  flushQueuedEvents(state, config);
}

function scheduleTransportReconnect(
  state: TraceTransportState,
  config: TraceConfig,
  context: TraceContext
): void {
  if (state.disconnectRequested || state.reconnectAttempts >= config.maxReconnectAttempts) {
    return;
  }

  state.reconnectAttempts++;
  state.reconnectTimeout = setTimeout(
    () => connectTransport(state, config, context),
    config.reconnectInterval
  );
}

function handleTransportClose(
  state: TraceTransportState,
  config: TraceConfig,
  context: TraceContext
): void {
  state.isConnected = false;
  state.ws = null;
  scheduleTransportReconnect(state, config, context);
}

function connectTransport(
  state: TraceTransportState,
  config: TraceConfig,
  context: TraceContext
): void {
  if (!config.enabled) {
    return;
  }

  if (
    state.ws &&
    (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  clearReconnectTimeout(state);
  state.disconnectRequested = false;

  try {
    state.ws = new WebSocket(`${config.wsUrl}:${config.wsPort}`);
    state.ws.onopen = () => handleTransportOpen(state, config, context);
    state.ws.onclose = () => handleTransportClose(state, config, context);
    state.ws.onerror = () => {
      state.isConnected = false;
    };
  } catch {
    state.ws = null;
    state.isConnected = false;
  }
}

function disconnectTransport(state: TraceTransportState): void {
  state.disconnectRequested = true;
  clearReconnectTimeout(state);
  if (state.ws) {
    state.ws.close();
  }
  state.ws = null;
  state.isConnected = false;
  clearQueue(state);
}

function clearQueue(state: TraceTransportState): void {
  state.messageQueue = [];
  if (state.batchTimeout) {
    clearTimeout(state.batchTimeout);
    state.batchTimeout = null;
  }
}
