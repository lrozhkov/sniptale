/* eslint-disable max-lines-per-function --
   exact console tracer proof keeps observer and fallback permutations together */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { recordConsoleTrace } from './console';
import { installActiveTraceObserver } from './runtime';
import type { TraceConfig, TraceEvent } from './types';

const TEST_CONFIG: TraceConfig = {
  batchInterval: 100,
  batchSize: 10,
  enabled: true,
  maxBufferSize: 100,
  maxPayloadSize: 24,
  maxReconnectAttempts: 2,
  reconnectInterval: 1000,
  sanitizeKeys: ['token'],
  wsPort: 9223,
  wsUrl: 'ws://localhost',
};

function installObserver(overrides: Partial<TraceConfig> = {}) {
  const events: TraceEvent[] = [];
  const sanitizeValue = vi.fn((value: unknown) => {
    if (value instanceof Error) {
      return {
        _error: true,
        message: value.message.replace('sk-live-secret', '***'),
        stack: value.stack?.replace('sk-live-secret', '***'),
      };
    }

    return { sanitized: value };
  });
  const safeStringify = vi.fn((value: unknown) => JSON.stringify(value));
  const dispose = installActiveTraceObserver({
    config: { ...TEST_CONFIG, ...overrides },
    context: 'popup',
    generateCorrelationId: vi.fn(() => 'corr-1'),
    safeStringify,
    sanitizeValue,
    sendEvent: (event) => events.push(event),
    sendTimestamps: new Map<string, number>(),
  });

  return { dispose, events, safeStringify, sanitizeValue };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recordConsoleTrace', () => {
  it('emits sanitized console events with truncated messages and error stacks', () => {
    const harness = installObserver();

    recordConsoleTrace('PopupTrace', 'error', [
      'apiKey=sk-live-secret',
      new Error('trace sk-live-secret'),
      { token: 'secret' },
    ]);

    expect(harness.sanitizeValue).toHaveBeenCalledWith({ token: 'secret' }, expect.any(Object));
    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]).toEqual(
      expect.objectContaining({
        kind: 'console',
        ctx: 'popup',
        level: 'error',
        data: { sanitized: { token: 'secret' } },
        err: expect.not.stringContaining('sk-live-secret'),
        msg: expect.stringContaining('[PopupTrace]'),
      })
    );
    expect((harness.events[0] as Extract<TraceEvent, { kind: 'console' }>).msg).not.toContain(
      'sk-live-secret'
    );
    expect(
      (harness.events[0] as Extract<TraceEvent, { kind: 'console' }>).msg.length
    ).toBeLessThanOrEqual(TEST_CONFIG.maxPayloadSize);

    harness.dispose();
  });

  it('skips tracing without an observer and falls back to String on stringify errors', () => {
    recordConsoleTrace('NoObserver', 'info', ['ignored']);

    const disabledHarness = installObserver({ enabled: false });
    recordConsoleTrace('DisabledTrace', 'info', ['disabled trace', { ok: true }]);
    expect(disabledHarness.events).toEqual([]);
    disabledHarness.dispose();

    const harness = installObserver();
    harness.safeStringify.mockImplementation(() => {
      throw new Error('stringify failed');
    });

    recordConsoleTrace('FallbackTrace', 'log', [{ fallback: true }, { raw: 'value' }]);

    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]).toEqual(
      expect.objectContaining({
        kind: 'console',
        level: 'log',
        data: { sanitized: { raw: 'value' } },
        msg: '[FallbackTrace] [object ',
      })
    );

    harness.dispose();
  });

  it('keeps single-string traces data-free and skips stack capture for non-error levels', () => {
    const harness = installObserver();

    recordConsoleTrace('PopupTrace', 'info', ['hello world']);

    expect(harness.events).toHaveLength(1);
    expect(harness.events[0]).toMatchObject({
      kind: 'console',
      ctx: 'popup',
      level: 'info',
      msg: '[PopupTrace] hello world',
    });
    expect(harness.events[0]).not.toHaveProperty('data');
    expect(harness.events[0]).not.toHaveProperty('err');

    harness.dispose();
  });
});
