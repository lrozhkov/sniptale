import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openRecordingFrameClockPort } from './recording-frame-clock-client';
import {
  RECORDING_FRAME_CLOCK_PURPOSE,
  type RecordingFrameClockLease,
} from '../../contracts/video/recording-frame-clock';

class TestPort extends EventTarget implements MessagePort {
  onmessage: MessagePort['onmessage'] = null;
  onmessageerror: MessagePort['onmessageerror'] = null;
  start = vi.fn();
  close = vi.fn();
  postMessage = vi.fn(
    (_value: unknown, _transfer?: Transferable[] | StructuredSerializeOptions) => undefined
  );
  send(data: unknown, ports: MessagePort[] = []) {
    const event = new MessageEvent<unknown>('message', { data });
    Object.defineProperty(event, 'ports', { value: ports });
    this.onmessage?.call(this, event);
  }
}
class TestChannel {
  static created: TestChannel[] = [];
  port1 = new TestPort();
  port2 = new TestPort();
  constructor() {
    TestChannel.created.push(this);
  }
}
function lease(): RecordingFrameClockLease {
  return {
    purpose: RECORDING_FRAME_CLOCK_PURPOSE,
    recordingId: 'recording',
    generation: 3,
    streamInstanceId: 'source',
    nonce: 'ba289176-c099-44d5-8f18-174e05565080',
    expiresAtEpochMs: 2000,
  };
}
function workerFixture() {
  const port = new TestPort();
  const worker = { port, onerror: null } as unknown as SharedWorker;
  return { port, worker, create: vi.fn(() => worker) };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  TestChannel.created = [];
  vi.stubGlobal('MessageChannel', TestChannel);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('transfers only a direct MessagePort through the worker and keeps frame transport outside its realm', async () => {
  const control = workerFixture();
  const cancellation = new AbortController();
  const connection = await openRecordingFrameClockPort(
    lease(),
    'source',
    cancellation.signal,
    control.create
  );
  const channel = TestChannel.created[0]!;
  expect(connection.port).toBe(channel.port1);
  expect(control.port.postMessage).toHaveBeenCalledExactlyOnceWith(
    { type: 'register', role: 'source', lease: lease() },
    [channel.port2]
  );
  expect(channel.port1.start).toHaveBeenCalledTimes(1);
  connection.close();
  expect(control.port.close).toHaveBeenCalledTimes(1);
  expect(channel.port1.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('releases source handles once when abort and explicit cleanup both occur', async () => {
  const control = workerFixture();
  const cancellation = new AbortController();
  const connection = await openRecordingFrameClockPort(
    lease(),
    'source',
    cancellation.signal,
    control.create
  );
  cancellation.abort();
  connection.close();
  connection.close();
  expect(control.port.close).toHaveBeenCalledTimes(1);
  expect(TestChannel.created[0]!.port1.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('receives exactly one renderer port and closes it once through owner cleanup', async () => {
  const control = workerFixture();
  const direct = new TestPort();
  const pending = openRecordingFrameClockPort(
    lease(),
    'renderer',
    new AbortController().signal,
    control.create
  );
  control.port.send({ type: 'direct-port', nonce: lease().nonce }, [direct]);
  const connection = await pending;
  expect(connection.port).toBe(direct);
  expect(direct.start).toHaveBeenCalledTimes(1);
  connection.close();
  expect(direct.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('disposes a replayed port while preserving the already delivered renderer connection', async () => {
  const control = workerFixture();
  const first = new TestPort();
  const replay = new TestPort();
  const pending = openRecordingFrameClockPort(
    lease(),
    'renderer',
    new AbortController().signal,
    control.create
  );
  control.port.send({ type: 'direct-port', nonce: lease().nonce }, [first]);
  const connection = await pending;
  control.port.send({ type: 'direct-port', nonce: lease().nonce }, [replay]);
  expect(connection.port).toBe(first);
  expect(replay.close).toHaveBeenCalledTimes(1);
  connection.close();
  expect(first.close).toHaveBeenCalledTimes(1);
});

it.each([
  { type: 'direct-port', nonce: 'wrong' },
  {
    type: 'direct-port',
    nonce: 'ba289176-c099-44d5-8f18-174e05565080',
    frame: { capturedPixels: true },
  },
  { type: 'unavailable' },
])(
  'rejects malformed or unavailable rendezvous responses and releases unclaimed transferred ports',
  async (data) => {
    const control = workerFixture();
    const incoming = new TestPort();
    const pending = openRecordingFrameClockPort(
      lease(),
      'renderer',
      new AbortController().signal,
      control.create
    );
    const refusal = expect(pending).rejects.toThrow();
    control.port.send(data, [incoming]);
    await refusal;
    expect(incoming.close).toHaveBeenCalledTimes(1);
    expect(control.port.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('rejects an expired response even when its scheduled deadline has not run yet', async () => {
  const control = workerFixture();
  const incoming = new TestPort();
  const pending = openRecordingFrameClockPort(
    lease(),
    'renderer',
    new AbortController().signal,
    control.create
  );
  const refusal = expect(pending).rejects.toThrow();
  vi.setSystemTime(2001);
  control.port.send({ type: 'direct-port', nonce: lease().nonce }, [incoming]);
  await refusal;
  expect(incoming.close).toHaveBeenCalledTimes(1);
});

it.each(['timeout', 'disconnect'] as const)(
  'releases renderer control resources on %s',
  async (cause) => {
    const control = workerFixture();
    const pending = openRecordingFrameClockPort(
      lease(),
      'renderer',
      new AbortController().signal,
      control.create
    );
    const refusal = expect(pending).rejects.toThrow();
    if (cause === 'timeout') await vi.advanceTimersByTimeAsync(1000);
    else control.port.onmessageerror?.call(control.port, new MessageEvent<unknown>('messageerror'));
    await refusal;
    expect(control.port.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('releases locally owned channel endpoints when the registration transfer throws', async () => {
  const control = workerFixture();
  control.port.postMessage.mockImplementation(() => {
    throw new Error('transfer failed');
  });
  await expect(
    openRecordingFrameClockPort(lease(), 'source', new AbortController().signal, control.create)
  ).rejects.toThrow();
  expect(control.port.close).toHaveBeenCalledTimes(1);
  expect(TestChannel.created[0]!.port1.close).toHaveBeenCalledTimes(1);
  expect(TestChannel.created[0]!.port2.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['expired', 'wrong purpose', 'aborted'] as const)(
  'refuses %s observer admission without opening worker or frame resources',
  async (cause) => {
    const control = workerFixture();
    const cancellation = new AbortController();
    const candidate =
      cause === 'expired'
        ? { ...lease(), expiresAtEpochMs: 999 }
        : cause === 'wrong purpose'
          ? { ...lease(), purpose: 'wrong' }
          : lease();
    if (cause === 'aborted') cancellation.abort();
    await expect(
      openRecordingFrameClockPort(
        candidate as RecordingFrameClockLease,
        'source',
        cancellation.signal,
        control.create
      )
    ).rejects.toThrow();
    expect(control.create).not.toHaveBeenCalled();
    expect(TestChannel.created).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  }
);
