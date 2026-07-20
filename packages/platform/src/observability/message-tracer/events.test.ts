import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRACE_CONFIG } from './types';
import {
  consumeSendDuration,
  createTraceMessageEvent,
  createTraceSendResponseWrapper,
  createTraceStatsSnapshot,
} from './events';

describe('message tracer event helpers', () => {
  it('builds a message event with explicit context and correlation id fallback', () => {
    const event = createTraceMessageEvent({
      currentContext: 'popup',
      dir: 'send',
      type: 'PING',
      target: 'bg',
      payload: { ok: true },
      now: '2026-03-20T08:30:00.000Z',
      generateId: () => 'generated-id',
    });

    expect(event).toEqual({
      kind: 'msg',
      ts: '2026-03-20T08:30:00.000Z',
      id: 'generated-id',
      dir: 'send',
      from: 'popup',
      to: 'bg',
      type: 'PING',
      payload: { ok: true },
      duration: undefined,
      error: undefined,
    });
  });

  it('consumes and clears stored send timestamps only when the correlation id exists', () => {
    const sendTimestamps = new Map<string, number>([['corr-1', 100]]);

    expect(consumeSendDuration(sendTimestamps, 'corr-1', 145)).toBe(45);
    expect(sendTimestamps.has('corr-1')).toBe(false);
    expect(consumeSendDuration(sendTimestamps, 'missing', 145)).toBeUndefined();
  });
});

describe('message tracer runtime wrappers', () => {
  it('creates a response wrapper that emits sanitized response events with duration', () => {
    const sendEvent = vi.fn();
    const wrapper = createTraceSendResponseWrapper({
      messageType: 'PING',
      sender: {} as chrome.runtime.MessageSender,
      config: { ...DEFAULT_TRACE_CONFIG, enabled: true },
      context: 'bg',
      sendEvent,
      sanitizeValue: (value) => ({ wrapped: value }),
      now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(145),
    });

    wrapper({ ok: true });

    expect(sendEvent).toHaveBeenCalledOnce();
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: 'send',
        type: 'PING_RESPONSE',
        to: 'bg',
        payload: { wrapped: { ok: true } },
        duration: 45,
      })
    );
  });
});

describe('message tracer LLM runtime wrappers', () => {
  it('summarizes LLM response wrapper payloads before observer sanitization', () => {
    const sendEvent = vi.fn();
    const wrapper = createTraceSendResponseWrapper({
      messageType: 'PROCESS_WITH_LLM',
      sender: {} as chrome.runtime.MessageSender,
      config: { ...DEFAULT_TRACE_CONFIG, enabled: true },
      context: 'bg',
      sendEvent,
      sanitizeValue: (value) => ({ wrapped: value }),
      now: vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(145),
    });

    wrapper({
      success: true,
      rawResponse: 'raw private output',
      cleanedResponse: '{"private":true}',
    });

    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          wrapped: expect.objectContaining({
            success: true,
            rawResponseSummaryLength: 18,
            cleanedResponseSummaryLength: 16,
          }),
        },
      })
    );
    expect(JSON.stringify(sendEvent.mock.calls)).not.toContain('raw private output');
  });
});

describe('message tracer runtime wrapper targeting', () => {
  it('targets content-script responses when the sender carries a tab and skips disabled configs', () => {
    const sendEvent = vi.fn();
    const wrapper = createTraceSendResponseWrapper({
      messageType: 'PING',
      sender: { tab: { id: 7 } } as chrome.runtime.MessageSender,
      config: { ...DEFAULT_TRACE_CONFIG, enabled: false },
      context: 'bg',
      sendEvent,
      sanitizeValue: (value) => ({ wrapped: value }),
    });

    wrapper({ ok: true });
    expect(sendEvent).not.toHaveBeenCalled();

    const enabledWrapper = createTraceSendResponseWrapper({
      messageType: 'PING',
      sender: { tab: { id: 7 } } as chrome.runtime.MessageSender,
      config: { ...DEFAULT_TRACE_CONFIG, enabled: true },
      context: 'bg',
      sendEvent,
      sanitizeValue: (value) => ({ wrapped: value }),
      now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(20),
    });
    enabledWrapper({ ok: true });

    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ to: 'cs' }));
  });
});

describe('message tracer stats snapshots', () => {
  it('creates a trace stats snapshot from transport state and timestamp size', () => {
    const stats = createTraceStatsSnapshot({
      transport: {
        connect: () => undefined,
        disconnect: () => undefined,
        sendEvent: () => undefined,
        flushQueue: () => undefined,
        clearQueue: () => undefined,
        isConnected: () => true,
        getDroppedEventCount: () => 3,
        getQueueSize: () => 7,
      },
      context: 'editor',
      enabled: true,
      sendTimestamps: new Map([
        ['a', 1],
        ['b', 2],
      ]),
    });

    expect(stats).toEqual({
      isConnected: true,
      droppedEventCount: 3,
      queueSize: 7,
      context: 'editor',
      enabled: true,
      timestampsCount: 2,
    });
  });
});
