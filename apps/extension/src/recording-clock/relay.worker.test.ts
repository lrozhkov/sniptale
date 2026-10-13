import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRecordingFrameClockRelay } from './relay.worker';
import {
  RECORDING_FRAME_CLOCK_PURPOSE,
  type RecordingFrameClockLease,
} from '../contracts/video/recording-frame-clock';

class RelayPort extends EventTarget implements MessagePort {
  onmessage: MessagePort['onmessage'] = null;
  onmessageerror: MessagePort['onmessageerror'] = null;
  start = vi.fn();
  close = vi.fn();
  postMessage = vi.fn(
    (_data: unknown, _transfer?: Transferable[] | StructuredSerializeOptions) => undefined
  );
  send(data: unknown, ports: MessagePort[] = []) {
    const event = new MessageEvent<unknown>('message', { data });
    Object.defineProperty(event, 'ports', { value: ports });
    this.onmessage?.call(this, event);
  }
}
function lease(index = 1): RecordingFrameClockLease {
  return {
    purpose: RECORDING_FRAME_CLOCK_PURPOSE,
    recordingId: 'recording',
    generation: 3,
    streamInstanceId: 'source',
    nonce: `${index.toString(16).padStart(8, '0')}-c099-44d5-8f18-174e05565080`,
    expiresAtEpochMs: 2000,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('rendezvous transfers one port, closes control handles and never sends pixels through the worker', () => {
  const accept = createRecordingFrameClockRelay();
  const source = new RelayPort();
  const renderer = new RelayPort();
  const direct = new RelayPort();
  accept(source);
  accept(renderer);
  source.send({ type: 'register', role: 'source', lease: lease() }, [direct]);
  renderer.send({ type: 'register', role: 'renderer', lease: lease() });
  expect(renderer.postMessage).toHaveBeenCalledExactlyOnceWith(
    { type: 'direct-port', nonce: lease().nonce },
    [direct]
  );
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(renderer.close).toHaveBeenCalledTimes(1);
  expect(direct.close).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  { type: 'register', role: 'source', lease: lease(), frame: { capturedPixels: true } },
  { type: 'frame', frame: { capturedPixels: true } },
  { type: 'register', role: 'unknown', lease: lease() },
])('rejects non-protocol worker input and releases every transferred handle', (data) => {
  const accept = createRecordingFrameClockRelay();
  const control = new RelayPort();
  const transferred = new RelayPort();
  accept(control);
  control.send(data, [transferred]);
  expect(control.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'unavailable' });
  expect(control.close).toHaveBeenCalledTimes(1);
  expect(transferred.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['wrong source', 'duplicate source'] as const)(
  'refuses %s for a pending lease without leaking the competing direct port',
  (cause) => {
    const accept = createRecordingFrameClockRelay();
    const first = new RelayPort();
    const firstDirect = new RelayPort();
    const competing = new RelayPort();
    const competingDirect = new RelayPort();
    accept(first);
    accept(competing);
    first.send({ type: 'register', role: 'source', lease: lease() }, [firstDirect]);
    const candidate =
      cause === 'wrong source' ? { ...lease(), streamInstanceId: 'different' } : lease();
    competing.send({ type: 'register', role: 'source', lease: candidate }, [competingDirect]);
    expect(competing.close).toHaveBeenCalledTimes(1);
    expect(competingDirect.close).toHaveBeenCalledTimes(1);
    expect(firstDirect.close).not.toHaveBeenCalled();
  }
);

it('refuses replay of a consumed lease while releasing the replay port', () => {
  const accept = createRecordingFrameClockRelay();
  const source = new RelayPort();
  const renderer = new RelayPort();
  const direct = new RelayPort();
  accept(source);
  accept(renderer);
  source.send({ type: 'register', role: 'source', lease: lease() }, [direct]);
  renderer.send({ type: 'register', role: 'renderer', lease: lease() });
  const replay = new RelayPort();
  const replayDirect = new RelayPort();
  accept(replay);
  replay.send({ type: 'register', role: 'source', lease: lease() }, [replayDirect]);
  expect(replay.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'unavailable' });
  expect(replayDirect.close).toHaveBeenCalledTimes(1);
  expect(renderer.postMessage).toHaveBeenCalledTimes(1);
});

it('cleans a waiting source immediately after disconnect and does not close it again at expiry', async () => {
  const accept = createRecordingFrameClockRelay();
  const source = new RelayPort();
  const direct = new RelayPort();
  accept(source);
  source.send({ type: 'register', role: 'source', lease: lease() }, [direct]);
  source.onmessageerror?.call(source, new MessageEvent<unknown>('messageerror'));
  expect(direct.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(source.close).toHaveBeenCalledTimes(1);
});

it('bounds pending source capabilities and releases the rejected fifth request', () => {
  const accept = createRecordingFrameClockRelay();
  for (let index = 1; index <= 4; index++) {
    const source = new RelayPort();
    accept(source);
    source.send({ type: 'register', role: 'source', lease: lease(index) }, [new RelayPort()]);
  }
  const rejected = new RelayPort();
  const direct = new RelayPort();
  accept(rejected);
  rejected.send({ type: 'register', role: 'source', lease: lease(5) }, [direct]);
  expect(rejected.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'unavailable' });
  expect(direct.close).toHaveBeenCalledTimes(1);
});

it('releases waiting source and native-free port handles at the lease deadline', async () => {
  const accept = createRecordingFrameClockRelay();
  const source = new RelayPort();
  const direct = new RelayPort();
  accept(source);
  source.send({ type: 'register', role: 'source', lease: lease() }, [direct]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(source.close).toHaveBeenCalledTimes(1);
  expect(direct.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([
  { recordingId: 'other recording' },
  { generation: 4 },
  { streamInstanceId: 'other source' },
])('refuses a renderer with a stale or different source binding under the same nonce', (patch) => {
  const accept = createRecordingFrameClockRelay();
  const source = new RelayPort();
  const renderer = new RelayPort();
  const direct = new RelayPort();
  accept(source);
  accept(renderer);
  source.send({ type: 'register', role: 'source', lease: lease() }, [direct]);
  renderer.send({ type: 'register', role: 'renderer', lease: { ...lease(), ...patch } });
  expect(renderer.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'unavailable' });
  expect(renderer.close).toHaveBeenCalledTimes(1);
  expect(direct.close).not.toHaveBeenCalled();
});

it.each([{ purpose: 'other operation' }, { expiresAtEpochMs: 999 }, { expiresAtEpochMs: 16001 }])(
  'refuses invalid purpose or temporal authority without retaining transferred handles',
  (patch) => {
    const accept = createRecordingFrameClockRelay();
    const source = new RelayPort();
    const direct = new RelayPort();
    accept(source);
    source.send({ type: 'register', role: 'source', lease: { ...lease(), ...patch } }, [direct]);
    expect(source.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'unavailable' });
    expect(source.close).toHaveBeenCalledTimes(1);
    expect(direct.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  }
);

it('bounds used capabilities until expiry without accepting an untracked replay namespace', () => {
  const accept = createRecordingFrameClockRelay();
  for (let index = 1; index <= 32; index++) {
    const source = new RelayPort();
    const renderer = new RelayPort();
    const direct = new RelayPort();
    accept(source);
    accept(renderer);
    source.send({ type: 'register', role: 'source', lease: lease(index) }, [direct]);
    renderer.send({ type: 'register', role: 'renderer', lease: lease(index) });
    expect(renderer.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: 'direct-port', nonce: lease(index).nonce },
      [direct]
    );
  }
  const excess = new RelayPort();
  const direct = new RelayPort();
  accept(excess);
  excess.send({ type: 'register', role: 'source', lease: lease(33) }, [direct]);
  expect(excess.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'unavailable' });
  expect(excess.close).toHaveBeenCalledTimes(1);
  expect(direct.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
