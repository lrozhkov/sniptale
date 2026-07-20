/**
 * Message Tracer - Runtime Tracing System
 *
 * Перехватывает console.* вызовы и message passing события.
 * Подключается к WebSocket-серверу только когда __TRACE_MESSAGES__ === true.
 */

import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { generateCorrelationId } from './events';
import { installActiveTraceObserver } from './runtime';
import { createTraceTransport, type TraceTransport } from './transport';
import {
  DEFAULT_TRACE_CONFIG,
  type TraceConfig,
  type TraceContext,
  type TraceEvent,
} from './types';
import { safeStringify, sanitizeValue } from './utils';

declare const __TRACE_MESSAGES__: boolean | undefined;

const TRACE_LOG_PREFIX = '[Tracer]';

type MessageTracerRuntimeState = {
  config: TraceConfig;
  isInitialized: boolean;
  context: TraceContext;
  transport: TraceTransport | null;
  sendTimestamps: Map<string, number>;
  disposeTraceObserver: (() => void) | null;
};

function createMessageTracerRuntimeState(): MessageTracerRuntimeState {
  return {
    config: { ...DEFAULT_TRACE_CONFIG },
    isInitialized: false,
    context: 'bg',
    transport: null,
    sendTimestamps: new Map<string, number>(),
    disposeTraceObserver: null,
  };
}

const defaultMessageTracerRuntimeState = createLazyDefaultOwner(createMessageTracerRuntimeState);

function getMessageTracerRuntimeState(): MessageTracerRuntimeState {
  return defaultMessageTracerRuntimeState.getOwner();
}

function teardownTraceObserver(state: MessageTracerRuntimeState): void {
  state.disposeTraceObserver?.();
  state.disposeTraceObserver = null;
}

function sendEvent(state: MessageTracerRuntimeState, event: TraceEvent): void {
  state.transport?.sendEvent(event);
}

function registerTraceObserver(state: MessageTracerRuntimeState): void {
  state.disposeTraceObserver = installActiveTraceObserver({
    config: state.config,
    context: state.context,
    generateCorrelationId,
    safeStringify,
    sanitizeValue,
    sendEvent: (event: TraceEvent) => sendEvent(state, event),
    sendTimestamps: state.sendTimestamps,
  });
}

export function initTracer(ctx: TraceContext, customConfig?: Partial<TraceConfig>): void {
  const state = getMessageTracerRuntimeState();
  if (typeof __TRACE_MESSAGES__ === 'undefined' || __TRACE_MESSAGES__ !== true) {
    state.config.enabled = false;
    return;
  }

  if (state.isInitialized) {
    console.warn(TRACE_LOG_PREFIX, 'Already initialized');
    return;
  }

  state.context = ctx;
  state.config = { ...DEFAULT_TRACE_CONFIG, enabled: true, ...customConfig };
  if (!state.config.enabled) {
    return;
  }
  state.isInitialized = true;

  console.log(TRACE_LOG_PREFIX, `Initializing for context: ${ctx}`);

  teardownTraceObserver(state);
  state.transport = createTraceTransport(state.config, state.context);
  state.transport.connect();

  registerTraceObserver(state);

  console.log(TRACE_LOG_PREFIX, `Initialized for ${ctx}`);
}
