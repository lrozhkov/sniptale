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

  it('replaces arbitrary voice input failures before trace sanitization', () => {
    const harness = installObserver();
    const privateFailure =
      'recognized phrase alfa bravo from microphone device device-secret-identifier';
    const tracker = beginSendTrace(
      { type: 'OFFSCREEN_VOICE_INPUT_START' },
      { type: 'OFFSCREEN_VOICE_INPUT_START' },
      'bg'
    );

    recordMessageFailure(new Error(privateFailure), tracker);

    expect(harness.events[1]).toEqual(
      expect.objectContaining({
        error: 'voice-input-runtime-failure',
        payload: { sanitized: { error: 'voice-input-runtime-failure' } },
      })
    );
    expect(JSON.stringify(harness.events[1])).not.toContain(privateFailure);
    expect(JSON.stringify(harness.events[1])).not.toContain('device-secret-identifier');

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
});

it('excludes quick-action artwork and private text from send, response and failure traces', () => {
  const harness = installObserver();
  try {
    const request = {
      type: 'OFFSCREEN_QUICK_ACTION_HEADER',
      source: { width: 640, height: 480 },
      header: {
        title: 'private-title',
        url: 'https://private.example/path',
        iconDataUrl: 'private-icon',
      },
      capability: 'private-capability',
    };
    const tracker = beginSendTrace(request, request, 'off');
    recordMessageResponse({ success: true, dataUrl: 'private-raster' }, tracker);
    const failed = beginSendTrace(request, request, 'off');
    recordMessageFailure(new Error('private-title private-error'), failed);
    const serialized = JSON.stringify(harness.events);
    expect(serialized).not.toContain('private-');
    expect(serialized).toContain('quick-action-appearance-runtime-failure');
    expect(harness.events[0]).toMatchObject({
      payload: {
        sanitized: { type: 'OFFSCREEN_QUICK_ACTION_HEADER', source: { width: 640, height: 480 } },
      },
    });
    expect(harness.events[3]).toMatchObject({ error: 'quick-action-appearance-runtime-failure' });
  } finally {
    harness.dispose();
  }
});

describe('sync product trace privacy', () => {
  it.each(['SYNC_PRODUCT_COMMAND', 'OFFSCREEN_SYNC_PRODUCT_COMMAND'])(
    'omits request, response and raw failure content for %s',
    (type) => {
      const observer = installObserver();
      try {
        const tracker = beginSendTrace(
          { type },
          {
            command: {
              parentUrl: 'https://private.example/account/',
              authentication: { kind: 'basic', username: 'alice', password: 'private-password' },
            },
          },
          'bg'
        );
        recordMessageResponse(
          { result: { kind: 'thumbnail', dataUrl: 'data:image/png;base64,cHJpdmF0ZQ==' } },
          tracker
        );
        const failed = beginSendTrace({ type }, { accountId: 'alice' }, 'bg');
        recordMessageFailure(new Error('private-provider-response'), failed);
        const output = JSON.stringify(observer.events);
        for (const secret of [
          'private.example',
          'alice',
          'private-password',
          'cHJpdmF0ZQ==',
          'private-provider-response',
        ])
          expect(output).not.toContain(secret);
        expect(output).toContain('sync-product-payload-omitted');
        expect(output).toContain('sync-product-failed');
      } finally {
        observer.dispose();
      }
    }
  );
});
