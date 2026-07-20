// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { DEFAULT_TRACE_CONFIG } from './types';
import { safeStringify, sanitizeTraceErrorText, sanitizeValue } from './utils';

function createTraceConfig(overrides?: Partial<typeof DEFAULT_TRACE_CONFIG>) {
  return {
    ...DEFAULT_TRACE_CONFIG,
    maxPayloadSize: 12,
    sanitizeKeys: ['password', 'token'],
    ...overrides,
  };
}

function createSanitizedObjectFixture() {
  return {
    password: 'secret',
    nestedToken: 'abc',
    headers: {
      Authorization: 'Bearer secret',
      'proxy-authorization': 'Bearer proxy-secret',
      'set-cookie': 'session=1',
    },
    safe: {
      title: 'visible',
      tokenValue: 'hidden',
      values: ['short', { passwordHint: 'still hidden' }],
    },
  };
}

function createSanitizedObjectExpectation() {
  return {
    password: '***',
    nestedToken: '***',
    headers: {
      Authorization: '***',
      'proxy-authorization': '***',
      'set-cookie': '***',
    },
    safe: {
      title: 'visible',
      tokenValue: '***',
      values: ['[max depth]', '[max depth]'],
    },
  };
}

describe('message-tracer-utils safeStringify', () => {
  it('stringifies circular structures and falls back for unsupported payloads', () => {
    const config = createTraceConfig();
    const circular: Record<string, unknown> = { id: 'root' };
    circular['self'] = circular;

    expect(safeStringify(circular, config)).toContain('"self":"[Circular]"');
    expect(safeStringify({ value: 1n }, config)).toBe('[Unable to stringify]');
  });
});

describe('message-tracer-utils sanitizeValue primitives', () => {
  it('sanitizes strings, primitives, errors, blobs, files, and max-depth recursion', () => {
    const config = createTraceConfig({ maxPayloadSize: 5 });
    const dataUrl = `data:image/png;base64,${'a'.repeat(120)}`;
    const error = new Error('Authorization: Bearer sk-secret-value');
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const file = new File(['payload'], 'trace.txt', { type: 'text/plain' });

    expect(sanitizeValue(dataUrl, config)).toBe(`[data URL: ${dataUrl.length} chars]`);
    expect(sanitizeValue('abcdef', config)).toBe('abcde... [truncated]');
    expect(sanitizeValue('apiKey=sk-secret-value', config)).toBe('apiKe... [truncated]');
    expect(sanitizeValue(42, config)).toBe(42);
    expect(sanitizeValue(false, config)).toBe(false);
    expect(sanitizeValue(error, config)).toEqual(
      expect.objectContaining({
        _error: true,
        name: 'Error',
        message: 'Autho... [truncated]',
        stack: expect.not.stringContaining('sk-secret-value'),
      })
    );
    expect(sanitizeValue(blob, config)).toBe('[Blob: 5 bytes, text/plain]');
    expect(sanitizeValue(file, config)).toBe('[Blob: 7 bytes, text/plain]');
    expect(sanitizeValue('deep', config, 6)).toBe('[max depth]');
    expect(sanitizeValue(Symbol.for('trace'), config)).toBe('Symbol(trace)');
  });

  it('redacts and truncates failure error text for top-level trace metadata', () => {
    const sanitized = sanitizeTraceErrorText(
      new Error('Authorization: Bearer sk-live-secret\n' + 'token=known-secret ' + 'x'.repeat(120)),
      createTraceConfig({ maxPayloadSize: 80 })
    );

    expect(sanitized).toContain('Authorization: ***');
    expect(sanitized).not.toContain('sk-live-secret');
    expect(sanitized).not.toContain('known-secret');
    expect(sanitized).toContain('[truncated]');
  });
});

describe('message-tracer-utils sanitizeValue collections', () => {
  it('sanitizes arrays and masks configured object keys recursively', () => {
    const config = createTraceConfig({
      sanitizeKeys: [...DEFAULT_TRACE_CONFIG.sanitizeKeys, 'password', 'token'],
    });
    const longArray = Array.from({ length: 25 }, (_, index) => index);
    const sanitizedObject = createSanitizedObjectFixture();

    expect(sanitizeValue(longArray, config)).toEqual([
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      '... 5 more items ...',
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
    ]);

    expect(sanitizeValue(sanitizedObject, config)).toEqual(createSanitizedObjectExpectation());
  });
});

describe('message-tracer-utils sanitized object safety', () => {
  it('uses null-prototype sanitized payloads for user-controlled object keys', () => {
    const config = createTraceConfig({ sanitizeKeys: ['apiKey'] });
    const payload = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"apiKey":"secret-key"},"apiKey":"secret-key"}'
    ) as Record<string, unknown>;

    const sanitized = sanitizeValue(payload, config) as Record<string, unknown>;
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
  });
});
