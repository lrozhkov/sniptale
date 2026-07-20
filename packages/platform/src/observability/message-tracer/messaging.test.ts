/* eslint-disable max-lines-per-function --
   exact messaging tracer proof keeps send/response and trimming behavior in one suite */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TRACE_CONFIG, type TraceEvent } from './types';
import { installActiveTraceObserver } from './runtime';
import {
  beginSendTrace,
  recordMessageFailure,
  recordMessageResponse,
  serializeMessagePayload,
} from './messaging';
import { sanitizeValue } from './utils';

function installObserver() {
  const events: TraceEvent[] = [];
  const sendTimestamps = new Map<string, number>();
  const dispose = installActiveTraceObserver({
    config: { ...DEFAULT_TRACE_CONFIG, enabled: true },
    context: 'popup',
    generateCorrelationId: vi.fn(() => 'corr-1'),
    safeStringify: vi.fn((value: unknown) => JSON.stringify(value)),
    sanitizeValue: vi.fn((value: unknown) => ({ sanitized: value })),
    sendEvent: (event) => events.push(event),
    sendTimestamps,
  });

  return { dispose, events, sendTimestamps };
}

function installTrimmingObserver() {
  const events: TraceEvent[] = [];
  const sendTimestamps = new Map<string, number>();
  const dispose = installActiveTraceObserver({
    config: { ...DEFAULT_TRACE_CONFIG, enabled: true },
    context: 'popup',
    generateCorrelationId: vi.fn(
      (() => {
        let index = 0;
        return () => `corr-${index++}`;
      })()
    ),
    safeStringify: vi.fn((value: unknown) => JSON.stringify(value)),
    sanitizeValue: vi.fn((value: unknown) => ({ sanitized: value })),
    sendEvent: (event) => events.push(event),
    sendTimestamps,
  });

  return { dispose, events, sendTimestamps };
}

function installSanitizingObserver() {
  const events: TraceEvent[] = [];
  const sendTimestamps = new Map<string, number>();
  const config = { ...DEFAULT_TRACE_CONFIG, enabled: true };
  const dispose = installActiveTraceObserver({
    config,
    context: 'popup',
    generateCorrelationId: vi.fn(() => 'corr-1'),
    safeStringify: vi.fn((value: unknown) => JSON.stringify(value)),
    sanitizeValue,
    sendEvent: (event) => events.push(event),
    sendTimestamps,
  });

  return { dispose, events, sendTimestamps };
}

function expectRuntimeAndTabTracePairs(events: TraceEvent[]) {
  expect(events).toEqual([
    expect.objectContaining({
      dir: 'send',
      from: 'popup',
      to: 'bg',
      type: 'PING',
      payload: { sanitized: { type: 'PING', payload: 1 } },
    }),
    expect.objectContaining({
      dir: 'recv',
      type: 'PING_RESPONSE',
      duration: 45,
      payload: { sanitized: { ok: true } },
    }),
    expect.objectContaining({
      dir: 'send',
      to: 'cs',
      type: 'TAB_PING',
      payload: { sanitized: { tabId: 7, type: 'TAB_PING', value: 2 } },
    }),
    expect.objectContaining({
      dir: 'recv',
      type: 'TAB_PING_RESPONSE',
      duration: 60,
      payload: { sanitized: { ok: true, tabId: 7 } },
    }),
  ]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('message tracer messaging helpers', () => {
  it('tracks send/response pairs for runtime and tab messages', () => {
    const harness = installObserver();
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(145)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(260);

    const runtimeTracker = beginSendTrace(
      { type: 'PING', payload: 1 },
      { type: 'PING', payload: 1 },
      'bg'
    );
    recordMessageResponse({ ok: true }, runtimeTracker);

    const tabTracker = beginSendTrace(
      { type: 'TAB_PING', value: 2 },
      serializeMessagePayload(7, { type: 'TAB_PING', value: 2 }),
      'cs'
    );
    recordMessageResponse({ ok: true, tabId: 7 }, tabTracker);

    expectRuntimeAndTabTracePairs(harness.events);

    harness.dispose();
  });

  it('records failures, skips missing message types, and trims stale timestamps', () => {
    const harness = installObserver();
    vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValueOnce(20);

    const failureTracker = beginSendTrace({ type: 'FAIL_ME' }, { type: 'FAIL_ME' }, 'bg');
    recordMessageFailure(new Error('boom'), failureTracker);

    expect(harness.events[1]).toEqual(
      expect.objectContaining({
        dir: 'recv',
        type: 'FAIL_ME_RESPONSE',
        error: 'boom',
      })
    );

    expect(
      beginSendTrace({ payload: 'missing-type' }, { payload: 'missing-type' }, 'bg')
    ).toBeNull();

    harness.dispose();
    const trimHarness = installTrimmingObserver();

    for (let index = 0; index < 101; index += 1) {
      beginSendTrace({ type: `PING_${index}` }, { type: `PING_${index}` }, 'bg');
    }

    expect(trimHarness.events).toHaveLength(101);
    expect(trimHarness.sendTimestamps.size).toBe(50);
    trimHarness.dispose();
  });

  it('sanitizes top-level failure error metadata before emitting trace events', () => {
    const harness = installSanitizingObserver();
    vi.spyOn(Date, 'now').mockReturnValueOnce(10).mockReturnValueOnce(20);

    const tracker = beginSendTrace({ type: 'FAIL_ME' }, { type: 'FAIL_ME' }, 'bg');
    recordMessageFailure(
      new Error('Authorization: Bearer sk-live-secret token=known-secret password=visible-secret'),
      tracker
    );

    expect(harness.events[1]).toEqual(
      expect.objectContaining({
        dir: 'recv',
        error: expect.stringContaining('Authorization: ***'),
      })
    );
    expect(JSON.stringify(harness.events[1])).not.toContain('sk-live-secret');
    expect(JSON.stringify(harness.events[1])).not.toContain('known-secret');
    expect(JSON.stringify(harness.events[1])).not.toContain('visible-secret');

    harness.dispose();
  });

  it('serializes primitive tab payloads and treats disabled observers as no-op', () => {
    const harness = installObserver();
    harness.dispose();

    expect(beginSendTrace({ type: 'PING' }, { type: 'PING' }, 'bg')).toBeNull();
    expect(serializeMessagePayload(7, 'primitive')).toEqual({
      tabId: 7,
      value: 'primitive',
    });
    expect(() => recordMessageResponse({ ok: true }, null)).not.toThrow();
    expect(() => recordMessageFailure('boom', null)).not.toThrow();
  });

  it('summarizes LLM send and response payloads before observer sanitization', () => {
    const harness = installObserver();

    const tracker = beginSendTrace(
      { type: 'PROCESS_WITH_LLM' },
      {
        type: 'PROCESS_WITH_LLM',
        llmSessionToken: 'token-secret',
        prompt: 'Private prompt',
        jsonData: '{"private":true}',
      },
      'bg'
    );
    recordMessageResponse(
      {
        success: true,
        rawResponse: 'raw private output',
        cleanedResponse: '{"private":true}',
      },
      tracker
    );

    expect(harness.events).toEqual([
      expect.objectContaining({
        payload: {
          sanitized: expect.objectContaining({
            type: 'PROCESS_WITH_LLM',
            llmSessionTokenSummaryLength: 12,
            promptSummaryLength: 14,
            jsonDataSummaryLength: 16,
          }),
        },
      }),
      expect.objectContaining({
        payload: {
          sanitized: expect.objectContaining({
            success: true,
            rawResponseSummaryLength: 18,
            cleanedResponseSummaryLength: 16,
          }),
        },
      }),
    ]);
    expect(JSON.stringify(harness.events)).not.toContain('Private prompt');
    expect(JSON.stringify(harness.events)).not.toContain('raw private output');

    harness.dispose();
  });

  it('redacts raw HAR query secrets before emitting response trace events', () => {
    const harness = installSanitizingObserver();

    const tracker = beginSendTrace(
      { type: 'EXPORT_STOP_HAR' },
      { type: 'EXPORT_STOP_HAR', sessionId: 'session-1' },
      'bg'
    );
    recordMessageResponse(
      {
        success: true,
        har: {
          queryString: [
            { name: 'password', value: 'password-secret' },
            { name: 'passphrase', value: 'passphrase-secret' },
            { name: 'session_id', value: 'session-secret' },
            { name: 'otp', value: 'otp-secret' },
            { name: 'q', value: 'public' },
          ],
          url: 'https://example.test/api?password=password-secret&q=public#frag',
        },
      },
      tracker
    );

    const serialized = JSON.stringify(harness.events);
    expect(serialized).not.toContain('password-secret');
    expect(serialized).not.toContain('passphrase-secret');
    expect(serialized).not.toContain('session-secret');
    expect(serialized).not.toContain('otp-secret');
    expect(serialized).not.toContain('#frag');
    expect(serialized).toContain('public');

    harness.dispose();
  });
});
