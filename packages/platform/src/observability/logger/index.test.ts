import { afterEach, describe, expect, it, vi } from 'vitest';

import { installActiveTraceObserver } from '../message-tracer/runtime';
import { createLogger } from './index';
import { isTraceEnabled } from './trace-enabled';

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__SNIPTALE_TRACE_NAMESPACES__');
  Reflect.deleteProperty(globalThis, '__SNIPTALE_RELEASE_BUILD__');
});

function createSink() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

function createObserverHarness() {
  const events: unknown[] = [];
  const dispose = installActiveTraceObserver({
    config: {
      batchInterval: 100,
      batchSize: 10,
      enabled: true,
      maxBufferSize: 100,
      maxPayloadSize: 1000,
      maxReconnectAttempts: 2,
      reconnectInterval: 1000,
      sanitizeKeys: ['token'],
      wsPort: 9223,
      wsUrl: 'ws://localhost',
    },
    context: 'bg',
    generateCorrelationId: vi.fn(() => 'corr-1'),
    safeStringify: vi.fn((value: unknown) => JSON.stringify(value)),
    sanitizeValue: vi.fn((value: unknown) => ({ sanitized: value })),
    sendEvent: (event) => events.push(event),
    sendTimestamps: new Map<string, number>(),
  });

  return { dispose, events };
}

function createTraceLogger() {
  const sink = createSink();
  const logger = createLogger({
    namespace: 'BackgroundVideo',
    sink,
    traceEnabled: true,
  });

  return { sink, logger };
}

describe('createLogger', () => {
  it('gates debug output behind explicit trace namespaces', () => {
    const sink = createSink();
    const logger = createLogger({
      namespace: 'BackgroundVideo',
      sink,
    });

    logger.debug('hidden');
    logger.warn('visible');

    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledWith('[BackgroundVideo]', 'visible');
  });

  it('enables debug output for matching namespaces and child loggers', () => {
    globalThis.__SNIPTALE_TRACE_NAMESPACES__ = ['BackgroundVideo'];

    const sink = createSink();
    const logger = createLogger({
      namespace: 'BackgroundVideo',
      sink,
    });

    logger.child('Preflight').debug('details');

    expect(isTraceEnabled('BackgroundVideo:Preflight')).toBe(true);
    expect(sink.debug).toHaveBeenCalledWith('[BackgroundVideo:Preflight]', 'details');
  });
});

describe('createLogger release gating', () => {
  it('silences routine logs in release builds while preserving warn and error', () => {
    globalThis.__SNIPTALE_RELEASE_BUILD__ = true;

    const sink = createSink();
    const logger = createLogger({
      namespace: 'BackgroundVideo',
      sink,
      traceEnabled: true,
    });

    logger.debug('debug');
    logger.info('info');
    logger.log('log');
    logger.warn('warn');
    logger.error('error');

    expect(sink.debug).not.toHaveBeenCalled();
    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.log).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledWith('[BackgroundVideo]', 'warn');
    expect(sink.error).toHaveBeenCalledWith('[BackgroundVideo]', 'error');
  });
});

describe('createLogger trace observer integration', () => {
  it('forwards emitted logger events into the active trace observer without patching console', () => {
    const { dispose, events } = createObserverHarness();
    const { sink, logger } = createTraceLogger();

    logger.warn('visible', { token: 'secret' });

    expect(sink.warn).toHaveBeenCalledWith('[BackgroundVideo]', 'visible', { token: '***' });
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'console',
        ctx: 'bg',
        level: 'warn',
        msg: expect.stringContaining('[BackgroundVideo] visible'),
      }),
    ]);

    dispose();
  });
});

describe('createLogger tracing payload sanitization', () => {
  it(
    'sanitizes warn and error payloads before they reach the console sink',
    verifyWarnAndErrorSanitization
  );

  it(
    'sanitizes debug info and log payloads before they reach the console sink',
    verifyDebugInfoAndLogSanitization
  );

  it(
    'uses null-prototype sanitized payloads for user-controlled object keys',
    verifyNullPrototypeSanitizedPayloads
  );

  it('redacts raw string and Error secrets before console and trace sinks', () => {
    const { dispose, events } = createObserverHarness();
    const { sink, logger } = createTraceLogger();
    const error = new Error('Authorization: Bearer sk-live-secret');

    logger.warn('apiKey=sk-live-secret');
    logger.error(error);

    expect(sink.warn).toHaveBeenCalledWith('[BackgroundVideo]', 'apiKey=***');
    expect(sink.error).toHaveBeenCalledWith('[BackgroundVideo]', expect.any(Error));
    const sanitizedError = sink.error.mock.calls[0]?.[1] as Error;
    expect(sanitizedError.message).toBe('Authorization: ***');
    expect(sanitizedError.stack).not.toContain('sk-live-secret');
    expect(JSON.stringify(events)).not.toContain('sk-live-secret');

    dispose();
  });
});

function verifyWarnAndErrorSanitization() {
  const { sink, logger } = createTraceLogger();

  logger.warn('warn', {
    headers: { Authorization: 'Bearer secret', 'set-cookie': 'session=1' },
  });
  logger.error({ cookie: 'session=1', password: 'hidden' });

  expect(sink.warn).toHaveBeenCalledWith('[BackgroundVideo]', 'warn', {
    headers: { Authorization: '***', 'set-cookie': '***' },
  });
  expect(sink.error).toHaveBeenCalledWith('[BackgroundVideo]', {
    cookie: '***',
    password: '***',
  });
}

function verifyDebugInfoAndLogSanitization() {
  const { sink, logger } = createTraceLogger();

  logger.debug({ proxyAuthorization: 'Bearer secret' });
  logger.info('info', { apiKey: 'secret-key', cookie: 'session=1' });
  logger.log({ password: 'hidden', authorization: 'Bearer secret' });

  expect(sink.debug).toHaveBeenCalledWith('[BackgroundVideo]', {
    proxyAuthorization: '***',
  });
  expect(sink.info).toHaveBeenCalledWith('[BackgroundVideo]', 'info', {
    apiKey: '***',
    cookie: '***',
  });
  expect(sink.log).toHaveBeenCalledWith('[BackgroundVideo]', {
    password: '***',
    authorization: '***',
  });
}

function verifyNullPrototypeSanitizedPayloads() {
  const { sink, logger } = createTraceLogger();
  const payload = JSON.parse(
    '{"__proto__":{"polluted":true},"constructor":{"apiKey":"secret-key"},"apiKey":"secret-key"}'
  ) as Record<string, unknown>;

  logger.info('payload', payload);

  const sanitized = sink.info.mock.calls[0]?.[2] as Record<string, unknown>;
  const protoPayload = sanitized['__proto__'] as Record<string, unknown>;
  const constructorPayload = sanitized['constructor'] as Record<string, unknown>;
  expect(Object.getPrototypeOf(sanitized)).toBeNull();
  expect(Object.hasOwn(sanitized, '__proto__')).toBe(true);
  expect(Object.hasOwn(sanitized, 'constructor')).toBe(true);
  expect(Object.getPrototypeOf(protoPayload)).toBeNull();
  expect(Object.getPrototypeOf(constructorPayload)).toBeNull();
  expect(sanitized['apiKey']).toBe('***');
  expect(constructorPayload['apiKey']).toBe('***');
  expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
}
