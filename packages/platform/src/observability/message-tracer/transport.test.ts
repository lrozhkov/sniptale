import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTraceTransport } from './transport';
import { DEFAULT_TRACE_CONFIG, type TraceConfig, type TraceEvent } from './types';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readonly send = vi.fn((payload: string) => {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error('send failed');
    }

    this.sent.push(payload);
  });
  readonly close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  failNextSend = false;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  readyState = FakeWebSocket.CONNECTING;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  static reset() {
    FakeWebSocket.instances = [];
  }

  triggerClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  triggerError() {
    this.onerror?.({} as Event);
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({} as Event);
  }
}

function createConfig(overrides: Partial<TraceConfig> = {}): TraceConfig {
  return {
    ...DEFAULT_TRACE_CONFIG,
    batchInterval: 25,
    enabled: true,
    batchSize: 2,
    maxBufferSize: 4,
    maxReconnectAttempts: 2,
    reconnectInterval: 50,
    ...overrides,
  };
}

function createEvent(id: string): TraceEvent {
  return {
    kind: 'msg',
    ts: '2026-03-22T12:00:00.000Z',
    id,
    dir: 'send',
    from: 'popup',
    to: 'bg',
    type: `TYPE_${id}`,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.reset();
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('trace transport connection', () => {
  it('does not connect or queue events when disabled', () => {
    const transport = createTraceTransport(createConfig({ enabled: false }), 'bg');

    transport.sendEvent(createEvent('ignored'));
    transport.connect();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(transport.isConnected()).toBe(false);
    expect(transport.getQueueSize()).toBe(0);
  });

  it('connects, clears the background session, and flushes queued events on open', () => {
    const transport = createTraceTransport(createConfig(), 'bg');
    transport.sendEvent(createEvent('queued'));

    transport.connect();
    const socket = FakeWebSocket.instances[0]!;
    socket.triggerOpen();

    expect(transport.isConnected()).toBe(true);
    expect(transport.getQueueSize()).toBe(0);
    expect(socket.url).toBe('ws://localhost:9223');
    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { command: 'clear' },
      { event: createEvent('queued') },
    ]);
  });
});

describe('trace transport batching', () => {
  it('batches connected events and reschedules the remaining queue', () => {
    const transport = createTraceTransport(createConfig(), 'popup');
    transport.connect();

    const socket = FakeWebSocket.instances[0]!;
    socket.triggerOpen();

    transport.sendEvent(createEvent('1'));
    transport.sendEvent(createEvent('2'));
    transport.sendEvent(createEvent('3'));

    expect(transport.getQueueSize()).toBe(3);

    vi.advanceTimersByTime(25);
    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { event: createEvent('1') },
      { event: createEvent('2') },
    ]);
    expect(transport.getQueueSize()).toBe(1);

    vi.advanceTimersByTime(25);
    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { event: createEvent('1') },
      { event: createEvent('2') },
      { event: createEvent('3') },
    ]);
    expect(transport.getQueueSize()).toBe(0);
  });
});

describe('trace transport send failures', () => {
  it('trims oversized disconnected buffers and requeues failed sends', () => {
    const transport = createTraceTransport(createConfig(), 'popup');

    transport.sendEvent(createEvent('1'));
    transport.sendEvent(createEvent('2'));
    transport.sendEvent(createEvent('3'));
    transport.sendEvent(createEvent('4'));
    transport.sendEvent(createEvent('5'));

    expect(transport.getQueueSize()).toBe(4);
    expect(transport.getDroppedEventCount()).toBe(1);

    transport.connect();
    const socket = FakeWebSocket.instances[0]!;
    socket.failNextSend = true;
    socket.triggerOpen();

    expect(transport.getQueueSize()).toBe(4);
    expect(socket.sent).toHaveLength(0);

    transport.flushQueue();
    expect(socket.sent.map((payload) => JSON.parse(payload))).toEqual([
      { event: createEvent('2') },
      { event: createEvent('3') },
      { event: createEvent('4') },
      { event: createEvent('5') },
    ]);
    expect(transport.getQueueSize()).toBe(0);
  });
});

describe('trace transport reconnect lifecycle', () => {
  it('reconnects on close, tracks socket errors, and disconnects cleanly', () => {
    const transport = createTraceTransport(createConfig(), 'popup');
    transport.connect();

    const firstSocket = FakeWebSocket.instances[0]!;
    firstSocket.triggerOpen();
    firstSocket.triggerError();

    expect(transport.isConnected()).toBe(false);

    firstSocket.triggerClose();
    vi.advanceTimersByTime(50);

    expect(FakeWebSocket.instances).toHaveLength(2);
    const secondSocket = FakeWebSocket.instances[1]!;

    transport.sendEvent(createEvent('queued'));
    expect(transport.getQueueSize()).toBe(1);

    transport.disconnect();

    expect(secondSocket.close).toHaveBeenCalledTimes(1);
    expect(transport.isConnected()).toBe(false);
    expect(transport.getQueueSize()).toBe(0);
  });

  it('cancels scheduled reconnect attempts after an explicit disconnect', () => {
    const transport = createTraceTransport(createConfig(), 'popup');
    transport.connect();

    const firstSocket = FakeWebSocket.instances[0]!;
    firstSocket.triggerOpen();

    transport.disconnect();
    firstSocket.triggerClose();
    vi.advanceTimersByTime(50);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
