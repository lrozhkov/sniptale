import { VideoSample } from 'mediabunny';
import { afterEach, expect, it, vi } from 'vitest';
import { createPresentationDecoder } from './presentation-decoder';

function fixture() {
  const controller = new AbortController();
  const closed = vi.fn();
  const samples: VideoSample[] = [];
  const make = (time: number) => {
    const sample = new VideoSample(new Uint8Array([1, 2, 3, 255]), {
      format: 'RGBA',
      codedWidth: 1,
      codedHeight: 1,
      timestamp: time,
    });
    vi.spyOn(sample, 'close');
    samples.push(sample);
    return sample;
  };
  const sink = {
    getSample: vi.fn(async (time: number) => make(time)),
    async *samples(start: number) {
      yield make(start);
    },
    samplesAtTimestamps: vi.fn(async function* (times: Iterable<number> | AsyncIterable<number>) {
      try {
        for await (const time of times) yield make(time);
      } finally {
        closed();
      }
    }),
  };
  const plan = [1, 2, 3].map((tick) => ({ tick, time: tick / 10 }));
  return {
    controller,
    closed,
    samples,
    sink,
    make,
    plan,
    open: () => createPresentationDecoder(sink, () => plan, controller.signal),
  };
}
afterEach(() => vi.restoreAllMocks());

it('uses one stream and transfers exact planned samples without random-access decoding', async () => {
  const f = fixture();
  const reader = f.open();
  for (const entry of f.plan) {
    const sample = await reader.read(entry.tick, entry.time);
    expect(sample?.timestamp).toBe(entry.time);
    sample?.close();
  }
  await reader.dispose();
  expect(f.sink.samplesAtTimestamps).toHaveBeenCalledOnce();
  expect(f.sink.getSample).not.toHaveBeenCalled();
  expect(f.closed).toHaveBeenCalledOnce();
  expect(f.samples.every((sample) => vi.mocked(sample.close).mock.calls.length === 1)).toBe(true);
});

it('releases skipped planned frames and preserves backward endpoint reads', async () => {
  const f = fixture();
  const reader = f.open();
  (await reader.read(1, 0.1))?.close();
  (await reader.read(0, 0.05))?.close();
  const third = await reader.read(3, 0.3);
  expect(third?.timestamp).toBe(0.3);
  third?.close();
  expect(f.sink.getSample).toHaveBeenCalledExactlyOnceWith(0.05);
  expect(f.samples.map((sample) => sample.timestamp)).toEqual([0.1, 0.05, 0.2, 0.3]);
  expect(f.samples.every((sample) => vi.mocked(sample.close).mock.calls.length === 1)).toBe(true);
  await reader.dispose();
});

it('keeps unplanned and held clocks separate from the next planned sample', async () => {
  const f = fixture();
  f.plan.splice(1, 1);
  const reader = f.open();
  (await reader.read(1, 0.1))?.close();
  (await reader.read(2, 0.2))?.close();
  (await reader.read(3, 0.29))?.close();
  const third = await reader.read(3, 0.3);
  expect(third?.timestamp).toBe(0.3);
  third?.close();
  (await reader.read(undefined, 0.4))?.close();
  expect(f.sink.getSample.mock.calls).toEqual([[0.2], [0.29], [0.4]]);
  expect(f.sink.samplesAtTimestamps).toHaveBeenCalledOnce();
  await reader.dispose();
});

it('fails rather than substituting a different frame when the planned stream ends early', async () => {
  const f = fixture();
  f.sink.samplesAtTimestamps.mockImplementation(async function* () {
    yield f.make(0.1);
  });
  const reader = f.open();
  (await reader.read(1, 0.1))?.close();
  await expect(reader.read(2, 0.2)).rejects.toThrow('unavailable');
  expect(f.sink.getSample).not.toHaveBeenCalled();
  await reader.dispose();
});

it('closes a late sample and its iterator when cancellation interrupts a pending read', async () => {
  const f = fixture();
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.sink.samplesAtTimestamps.mockImplementation(async function* () {
    entered();
    try {
      await waiting;
      yield f.make(0.1);
    } finally {
      f.closed();
    }
  });
  const reader = f.open();
  const reading = reader.read(1, 0.1);
  await started;
  f.controller.abort();
  const closing = reader.dispose();
  const rejected = expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  release();
  await rejected;
  await closing;
  expect(f.samples[0]!.close).toHaveBeenCalledOnce();
  expect(f.closed).toHaveBeenCalledOnce();
  await expect(reader.read(2, 0.2)).rejects.toMatchObject({ name: 'AbortError' });
});

it('opens no decoder if cancellation precedes the first request', async () => {
  const f = fixture();
  const reader = f.open();
  f.controller.abort();
  await expect(reader.read(1, 0.1)).rejects.toMatchObject({ name: 'AbortError' });
  await reader.dispose();
  expect(f.sink.samplesAtTimestamps).not.toHaveBeenCalled();
});
