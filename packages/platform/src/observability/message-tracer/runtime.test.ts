import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getActiveTraceObserver,
  installActiveTraceObserver,
  type ActiveTraceObserver,
} from './runtime';
import { DEFAULT_TRACE_CONFIG } from './types';

function createObserver(context: ActiveTraceObserver['context']): ActiveTraceObserver {
  return {
    config: { ...DEFAULT_TRACE_CONFIG, enabled: true },
    context,
    generateCorrelationId: vi.fn(() => `${context}-corr`),
    safeStringify: vi.fn((value: unknown) => JSON.stringify(value)),
    sanitizeValue: vi.fn((value: unknown) => value),
    sendEvent: vi.fn(),
    sendTimestamps: new Map<string, number>(),
  };
}

afterEach(() => {
  const activeObserver = getActiveTraceObserver();
  if (activeObserver) {
    installActiveTraceObserver(activeObserver)();
  }
});

describe('message-tracer-runtime', () => {
  it('installs and removes the active trace observer through the returned disposer', () => {
    const observer = createObserver('bg');
    const dispose = installActiveTraceObserver(observer);

    expect(getActiveTraceObserver()).toBe(observer);

    dispose();

    expect(getActiveTraceObserver()).toBeNull();
  });

  it('keeps a newer observer installed when an older disposer runs later', () => {
    const firstObserver = createObserver('popup');
    const secondObserver = createObserver('cs');
    const disposeFirst = installActiveTraceObserver(firstObserver);
    const disposeSecond = installActiveTraceObserver(secondObserver);

    disposeFirst();

    expect(getActiveTraceObserver()).toBe(secondObserver);

    disposeSecond();

    expect(getActiveTraceObserver()).toBeNull();
  });
});
