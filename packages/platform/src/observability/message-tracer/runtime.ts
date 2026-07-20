import type { TraceConfig, TraceContext, TraceEvent } from './types';

export type ActiveTraceObserver = {
  config: TraceConfig;
  context: TraceContext;
  generateCorrelationId: () => string;
  safeStringify: (value: unknown, config: TraceConfig) => string;
  sanitizeValue: (value: unknown, config: TraceConfig) => unknown;
  sendEvent: (event: TraceEvent) => void;
  sendTimestamps: Map<string, number>;
};

let activeTraceObserver: ActiveTraceObserver | null = null;

export function installActiveTraceObserver(observer: ActiveTraceObserver): () => void {
  activeTraceObserver = observer;

  return () => {
    if (activeTraceObserver === observer) {
      activeTraceObserver = null;
    }
  };
}

export function getActiveTraceObserver(): ActiveTraceObserver | null {
  return activeTraceObserver;
}
