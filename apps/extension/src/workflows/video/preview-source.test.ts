import { afterEach, expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import { createReviewExportDiagnostics } from '../video-review/export-diagnostics';
import {
  createPreviewSourceProvider,
  PreviewSourceSupersededError,
  resolvePreviewSourceOrdinaryTime,
  resolvePreviewSourceRequest,
  type PreviewSourceDemand,
  type PreviewSourceLease,
  type PreviewSourceStream,
} from './preview-source';

it('shares ordinary rounded lookup while preserving logical, leading and EOF times', () => {
  expect(resolvePreviewSourceOrdinaryTime(0.1, 1)).toEqual({
    target: 0.1,
    effectiveTime: 0.1,
    lookupTime: 0.10000200000000001,
  });
  expect(resolvePreviewSourceOrdinaryTime(0, 1, 1 / 60)).toMatchObject({
    target: 0,
    effectiveTime: 1 / 60,
  });
  const edge = resolvePreviewSourceOrdinaryTime(0.999999, 1);
  expect(edge.lookupTime).toBeLessThan(1);
  expect(edge.lookupTime).toBeGreaterThan(edge.target);
});

it.each([NaN, Infinity, -1, 1])('rejects invalid ordinary target%s', (target) => {
  expect(() => resolvePreviewSourceOrdinaryTime(target, 1)).toThrow();
});

it('selects the common rounded future packet and a negative first PTS without shifting targets', async () => {
  const f = fixture([-0.1, 0.100001, 0.2], 1);
  const first = await f.provider.acquire([demand(0)], signal());
  expect(binding(first)).toMatchObject({ target: 0, timestamp: -0.1, nextTimestamp: 0.100001 });
  first?.release();
  const next = await f.provider.acquire([demand(0.1)], signal());
  expect(binding(next)).toMatchObject({ target: 0.1, timestamp: 0.100001, nextTimestamp: 0.2 });
  next?.release();
  f.provider.dispose();
});

const signal = () => new AbortController().signal;
const demand = (time: number, id = 'frame', url = 'blob:source'): PreviewSourceDemand => ({
  id,
  url,
  time,
});
function sample(timestamp: number): VideoSample {
  return new VideoSample(new Uint8Array(16), {
    format: 'RGBA',
    codedWidth: 2,
    codedHeight: 2,
    timestamp,
    duration: 0.016667,
  });
}
function fixture(timestamps = [0, 0.1, 0.3, 0.4], end = 0.5) {
  const samples = timestamps.map(sample);
  const closed = samples.map((value) => vi.spyOn(value, 'close'));
  let index = 0;
  const next = vi.fn(async (): Promise<IteratorResult<VideoSample>> => {
    const value = samples[index++];
    return value ? { done: false, value } : { done: true, value: undefined };
  });
  const returned = vi.fn(async (): Promise<IteratorResult<VideoSample>> => ({
    done: true,
    value: undefined,
  }));
  const iterator: AsyncIterableIterator<VideoSample> = {
    next,
    return: returned,
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  const stream: PreviewSourceStream = { end, samples: vi.fn(() => iterator), dispose: vi.fn() };
  const open = vi.fn(async (): Promise<PreviewSourceStream | null> => stream);
  const provider = createPreviewSourceProvider({ open });
  return { provider, open, stream, iterator, next, returned, samples, closed };
}
function binding(lease: PreviewSourceLease | null, id = 'frame') {
  if (!lease) throw new Error('Expected a supported source lease.');
  const result = lease.bindings.get(id);
  if (!result) throw new Error('Expected the requested source binding.');
  return result;
}
afterEach(() => vi.restoreAllMocks());

it('uses successor PTS instead of nominal duration and reuses one stream across logical clip requests', async () => {
  const f = fixture([39.15, 39.183333, 39.216667, 39.283333, 39.316667, 39.35], 40);
  const lease = await f.provider.acquire([demand(39.292117233, 'incoming-speed')], signal());
  expect(binding(lease, 'incoming-speed')).toMatchObject({
    timestamp: 39.283333,
    nextTimestamp: 39.316667,
    target: 39.292117233,
  });
  expect(binding(lease, 'incoming-speed').source).toMatchObject({
    sourceWidth: 2,
    sourceHeight: 2,
    orientation: { rotation: 0, flip: false },
  });
  const next = await f.provider.acquire([demand(39.3, 'another-instance')], signal());
  expect(binding(next, 'another-instance').timestamp).toBe(39.283333);
  expect(binding(next, 'another-instance').source).not.toBe(
    binding(lease, 'incoming-speed').source
  );
  expect(f.open).toHaveBeenCalledOnce();
  expect(f.stream.samples).toHaveBeenCalledOnce();
  expect(f.next).toHaveBeenCalledTimes(5);
  lease?.release();
  next?.release();
  f.provider.dispose();
});

it('acquires a finite sorted aperture and keeps distinct exposure bindings for one logical clip', async () => {
  const f = fixture();
  const lease = await f.provider.acquire(
    [demand(0.32, 'nominal'), demand(0.02, 'earlier'), demand(0.15, 'exposure')],
    signal()
  );
  expect(['earlier', 'exposure', 'nominal'].map((id) => binding(lease, id).timestamp)).toEqual([
    0, 0.1, 0.3,
  ]);
  expect(f.stream.samples).toHaveBeenCalledWith(0.02, 0.5);
  lease?.release();
  f.provider.dispose();
});

it('selects the final duplicate PTS and uses verified end only for the terminal interval', async () => {
  const f = fixture([0, 0.1, 0.1, 0.3], 0.5);
  const clone = vi.spyOn(f.samples[2]!, 'clone');
  const lease = await f.provider.acquire([demand(0.2)], signal());
  expect(binding(lease)).toMatchObject({ timestamp: 0.1, nextTimestamp: 0.3 });
  expect(clone).toHaveBeenCalledOnce();
  expect(f.closed[1]).toHaveBeenCalledOnce();
  const terminal = await f.provider.acquire([demand(0.49)], signal());
  expect(binding(terminal)).toMatchObject({ timestamp: 0.3, nextTimestamp: 0.5 });
  await expect(f.provider.acquire([demand(0.5)], signal())).rejects.toThrow(
    'Preview source frame is unavailable.'
  );
  lease?.release();
  terminal?.release();
  f.provider.dispose();
});

it('keeps half-open boundary selection and allows only microsecond rounding', async () => {
  const f = fixture();
  const lease = await f.provider.acquire(
    [demand(0.1, 'edge'), demand(0.099999, 'rounded'), demand(0.09999, 'before')],
    signal()
  );
  expect(binding(lease, 'edge').timestamp).toBe(0.1);
  expect(binding(lease, 'rounded').timestamp).toBe(0.1);
  expect(binding(lease, 'before').timestamp).toBe(0);
  lease?.release();
  f.provider.dispose();
});

it('validates retained range and duplicate identities before opening a source', async () => {
  const f = fixture();
  for (const demands of [
    [demand(NaN)],
    [demand(-1)],
    [demand(0.1), demand(0.2)],
    [{ ...demand(0.2), rangeStart: 0.3 }],
    [{ ...demand(0.2), rangeEnd: 0.1 }],
  ]) {
    await expect(f.provider.acquire(demands, signal())).rejects.toThrow(
      'Preview source frame is unavailable.'
    );
  }
  expect(f.open).not.toHaveBeenCalled();
  f.provider.dispose();
});

it('returns early unsupported for a new URL after another URL succeeded and keeps decode failures fixed', async () => {
  const open = vi.fn(async (): Promise<PreviewSourceStream | null> => null);
  const unsupported = createPreviewSourceProvider({ open });
  expect(await unsupported.acquire([demand(0)], signal())).toBeNull();
  unsupported.dispose();
  const f = fixture();
  const lease = await f.provider.acquire([demand(0.05)], signal());
  f.provider.retainSources(new Set(['blob:unsupported']));
  f.open.mockResolvedValueOnce(null);
  expect(await f.provider.acquire([demand(0, 'missing', 'blob:unsupported')], signal())).toBeNull();
  expect(binding(lease).timestamp).toBe(0);
  lease?.release();
  f.provider.dispose();
  const failed = fixture();
  failed.next.mockRejectedValueOnce(new Error('Private decoder data'));
  await expect(failed.provider.acquire([demand(0)], signal())).rejects.toThrow(
    /^Preview source frame is unavailable\.$/
  );
  failed.provider.dispose();
});

it('keeps GPU borrower clones alive when URLs retire and releases them exactly once', async () => {
  const f = fixture();
  const clones: VideoSample[] = [];
  const original = f.samples[0]!.clone.bind(f.samples[0]);
  vi.spyOn(f.samples[0]!, 'clone').mockImplementation(() => {
    const clone = original();
    clones.push(clone);
    vi.spyOn(clone, 'close');
    return clone;
  });
  const first = await f.provider.acquire([demand(0.02)], signal());
  const second = await f.provider.acquire([demand(0.03)], signal());
  f.provider.retainSources(new Set());
  expect(f.closed[0]).toHaveBeenCalledOnce();
  expect(f.stream.dispose).toHaveBeenCalledOnce();
  expect(clones.map((clone) => vi.mocked(clone.close).mock.calls.length)).toEqual([0, 0]);
  first?.release();
  first?.release();
  expect(clones.map((clone) => vi.mocked(clone.close).mock.calls.length)).toEqual([1, 0]);
  f.provider.dispose();
  expect(clones.map((clone) => vi.mocked(clone.close).mock.calls.length)).toEqual([1, 0]);
  second?.release();
  expect(clones.map((clone) => vi.mocked(clone.close).mock.calls.length)).toEqual([1, 1]);
});

it('keeps only latest pending acquire and aborting a request does not dispose the physical stream', async () => {
  const f = fixture();
  const started = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<IteratorResult<VideoSample>>();
  f.next.mockImplementationOnce(() => {
    started.resolve();
    return gate.promise;
  });
  const controller = new AbortController();
  const first = f.provider
    .acquire([demand(0.02)], controller.signal)
    .catch((error: unknown) => error);
  await started.promise;
  const obsolete = f.provider.acquire([demand(0.12)], signal()).catch((error: unknown) => error);
  const latest = f.provider.acquire([demand(0.32)], signal());
  expect(await obsolete).toBeInstanceOf(PreviewSourceSupersededError);
  expect(await obsolete).toBeInstanceOf(DOMException);
  expect(await obsolete).toMatchObject({
    name: 'AbortError',
    message: 'Preview source request was cancelled.',
  });
  controller.abort();
  expect(await first).toMatchObject({ name: 'AbortError' });
  expect(await first).not.toBeInstanceOf(PreviewSourceSupersededError);
  expect(f.stream.dispose).not.toHaveBeenCalled();
  gate.resolve({ done: false, value: sample(0) });
  const lease = await latest;
  expect(binding(lease).timestamp).toBe(0.3);
  expect(f.open).toHaveBeenCalledOnce();
  expect(f.stream.samples).toHaveBeenCalledOnce();
  lease?.release();
  f.provider.dispose();
});

it('retires a removed URL after the active opening settles and preserves its borrower', async () => {
  const f = fixture();
  const opening = Promise.withResolvers<PreviewSourceStream | null>();
  f.open.mockImplementationOnce(() =>
    opening.promise.then((value) => {
      if (!value) throw new Error('Missing stream');
      return value;
    })
  );
  const pending = f.provider.acquire([demand(0)], signal());
  f.provider.retainSources(new Set());
  expect(f.stream.dispose).not.toHaveBeenCalled();
  opening.resolve(f.stream);
  const lease = await pending;
  expect(binding(lease).timestamp).toBe(0);
  await Promise.resolve();
  expect(f.stream.dispose).toHaveBeenCalledOnce();
  lease?.release();
  f.provider.dispose();
});

it('disposes pending reads and closes a sample that arrives after disposal', async () => {
  const f = fixture();
  const started = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<IteratorResult<VideoSample>>();
  f.next.mockImplementationOnce(() => {
    started.resolve();
    return gate.promise;
  });
  const pending = f.provider.acquire([demand(0)], signal()).catch((error: unknown) => error);
  await started.promise;
  const queued = f.provider.acquire([demand(0.1)], signal()).catch((error: unknown) => error);
  f.provider.dispose();
  f.provider.dispose();
  expect(await pending).toMatchObject({ name: 'AbortError' });
  expect(await pending).not.toBeInstanceOf(PreviewSourceSupersededError);
  expect(await queued).toMatchObject({ name: 'AbortError' });
  expect(await queued).not.toBeInstanceOf(PreviewSourceSupersededError);
  const late = sample(0);
  const close = vi.spyOn(late, 'close');
  gate.resolve({ done: false, value: late });
  await gate.promise;
  await Promise.resolve();
  expect(close).toHaveBeenCalledOnce();
  expect(f.stream.dispose).toHaveBeenCalledOnce();
  await expect(f.provider.acquire([demand(0)], signal())).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it('charges allocationSize and refuses over-budget successor storage while preserving borrowed samples', async () => {
  const f = fixture();
  for (const value of f.samples)
    vi.spyOn(value, 'allocationSize').mockReturnValue(70 * 1024 * 1024);
  await expect(f.provider.acquire([demand(0.02)], signal())).rejects.toMatchObject({
    name: 'EffectRuntimeResourceError',
  });
  expect(f.samples[0]!.allocationSize).toHaveBeenCalledOnce();
  expect(f.samples[1]!.allocationSize).toHaveBeenCalledOnce();
  expect(f.closed[1]).toHaveBeenCalledOnce();
  f.provider.dispose();
});

it('rejects an early absent frame and an invalid terminal end without fabricating an interval', async () => {
  const f = fixture([0.1, 0.2], 0.3);
  await expect(f.provider.acquire([demand(0)], signal())).rejects.toThrow(
    'Preview source frame is unavailable.'
  );
  f.provider.dispose();
  const invalid = fixture([0], Infinity);
  await expect(invalid.provider.acquire([demand(0)], signal())).rejects.toThrow(
    'Preview source frame is unavailable.'
  );
  invalid.provider.dispose();
});

it('restarts only the iterator for a backward seek outside retained storage and keeps prior GPU leases', async () => {
  const f = fixture();
  const clones: VideoSample[] = [];
  const originalClone = VideoSample.prototype.clone;
  vi.spyOn(VideoSample.prototype, 'clone').mockImplementation(function (this: VideoSample) {
    const clone = originalClone.call(this);
    clones.push(clone);
    vi.spyOn(clone, 'close');
    return clone;
  });
  vi.mocked(f.stream.samples).mockImplementation(async function* (start: number) {
    for (let time = Math.floor(start * 10) / 10; time < 0.5; time += 0.1) yield sample(time);
  });
  const first = await f.provider.acquire([demand(0.32)], signal());
  const second = await f.provider.acquire([demand(0.02)], signal());
  expect(binding(first).timestamp).toBeCloseTo(0.3);
  expect(binding(second).timestamp).toBe(0);
  expect(f.open).toHaveBeenCalledOnce();
  expect(f.stream.samples).toHaveBeenCalledTimes(2);
  expect(vi.mocked(clones[0]!.close)).not.toHaveBeenCalled();
  first?.release();
  second?.release();
  f.provider.dispose();
  expect(clones.map((clone) => vi.mocked(clone.close).mock.calls.length)).toEqual([1, 1]);
});

it('bounds the decoded ring by entry count while advancing one continuous iterator', async () => {
  const values: VideoSample[] = [];
  const closeCounts = new Map<VideoSample, number>();
  const stream: PreviewSourceStream = {
    end: 101,
    async *samples(start) {
      for (let time = Math.floor(start); time < 101; time++) {
        const value = sample(time);
        values.push(value);
        const close = value.close.bind(value);
        vi.spyOn(value, 'close').mockImplementation(() => {
          closeCounts.set(value, (closeCounts.get(value) ?? 0) + 1);
          close();
        });
        yield value;
      }
    },
    dispose: vi.fn(),
  };
  const iterator = vi.spyOn(stream, 'samples');
  const open = vi.fn(async () => stream);
  const provider = createPreviewSourceProvider({ open });
  const lease = await provider.acquire([demand(0.02)], signal());
  const tail = await provider.acquire([demand(98.2)], signal());
  expect(binding(tail).timestamp).toBe(98);
  expect(iterator).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
  expect(values.length).toBe(100);
  expect(values.filter((value) => !closeCounts.has(value)).length).toBeLessThanOrEqual(64);
  lease?.release();
  tail?.release();
  provider.dispose();
  expect(values.every((value) => closeCounts.get(value) === 1)).toBe(true);
});

it('uses track decodability for early default-opener fallback and disposes its input', async () => {
  const dispose = vi.fn();
  const canDecode = vi.fn(async () => false);
  vi.doMock('mediabunny', async (importOriginal) => ({
    ...(await importOriginal<typeof import('mediabunny')>()),
    Input: class {
      dispose = dispose;
      async getPrimaryVideoTrack() {
        return { canDecode };
      }
    },
    UrlSource: class {},
  }));
  try {
    const provider = createPreviewSourceProvider();
    expect(await provider.acquire([demand(0)], signal())).toBeNull();
    expect(canDecode).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    provider.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  } finally {
    vi.doUnmock('mediabunny');
  }
});

it('keeps retired physical storage charged until its last GPU borrower releases it', async () => {
  const open = vi.fn(async (url: string): Promise<PreviewSourceStream> => ({
    end: 0.3,
    async *samples() {
      for (const time of [0, 0.1, 0.2]) {
        const value = sample(time);
        vi.spyOn(value, 'allocationSize').mockReturnValue(
          (url === 'blob:first' ? 40 : 60) * 1024 * 1024
        );
        yield value;
      }
    },
    dispose: vi.fn(),
  }));
  const provider = createPreviewSourceProvider({ open });
  const first = await provider.acquire([demand(0.02, 'first', 'blob:first')], signal());
  provider.retainSources(new Set(['blob:second']));
  await Promise.resolve();
  await expect(
    provider.acquire([demand(0.02, 'second', 'blob:second')], signal())
  ).rejects.toMatchObject({ name: 'EffectRuntimeResourceError' });
  expect(binding(first, 'first').timestamp).toBe(0);
  first?.release();
  const next = await provider.acquire([demand(0.02, 'second', 'blob:second')], signal());
  expect(binding(next, 'second').timestamp).toBe(0);
  expect(open.mock.calls.map(([url]) => url)).toEqual(['blob:first', 'blob:second', 'blob:second']);
  next?.release();
  provider.dispose();
});

it('does not open or allocate for a pre-aborted request', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(f.provider.acquire([demand(0)], controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(f.open).not.toHaveBeenCalled();
  expect(f.next).not.toHaveBeenCalled();
  f.provider.dispose();
});

it('rebases an explicit distant forward aperture once per URL without reopening its input', async () => {
  const starts: number[] = [];
  let decoded = 0;
  const open = vi.fn(async (): Promise<PreviewSourceStream> => ({
    end: 100,
    async *samples(start) {
      starts.push(start);
      for (let index = Math.floor(start * 10); index < 1000; index++) {
        decoded++;
        yield sample(index / 10);
      }
    },
    dispose: vi.fn(),
  }));
  const provider = createPreviewSourceProvider({ open });
  const initial = await provider.acquire([demand(0.02)], signal());
  initial?.release();
  const before = decoded;
  const seek = await provider.acquire([demand(37.5, 'lower'), demand(37.55, 'upper')], signal(), {
    discontinuity: true,
  });
  expect(binding(seek, 'lower')).toMatchObject({ timestamp: 37.5, nextTimestamp: 37.6 });
  expect(starts).toEqual([0.02, 37.5]);
  expect(decoded - before).toBe(2);
  expect(open).toHaveBeenCalledOnce();
  const cached = await provider.acquire([demand(37.52)], signal(), { discontinuity: true });
  expect(binding(cached).timestamp).toBe(37.5);
  expect(starts).toEqual([0.02, 37.5]);
  expect(decoded - before).toBe(2);
  seek?.release();
  cached?.release();
  provider.dispose();
});

it('retires consumed originals before a pending finite-output read while its GPU clone stays borrowed', async () => {
  const reading = Promise.withResolvers<void>();
  const continueRead = Promise.withResolvers<void>();
  const originals = new Set<VideoSample>();
  const cloneCounts = new Map<VideoSample, number>();
  const cloneOrigins = new Map<VideoSample, VideoSample>();
  const backingCount = () => new Set([...originals, ...cloneOrigins.values()]).size;
  const next = vi.fn();
  const stream: PreviewSourceStream = {
    end: 1,
    samples(start) {
      let index = Math.floor(start * 10);
      const iterator: AsyncIterableIterator<VideoSample> = {
        async next() {
          next();
          if (next.mock.calls.length === 3) {
            reading.resolve();
            await continueRead.promise;
          }
          if (backingCount() >= 2)
            throw new Error('Controlled source output capacity is exhausted.');
          const value = sample(index++ / 10);
          originals.add(value);
          const close = value.close.bind(value);
          vi.spyOn(value, 'close').mockImplementation(() => {
            originals.delete(value);
            close();
          });
          const clone = value.clone.bind(value);
          vi.spyOn(value, 'clone').mockImplementation(() => {
            const borrowed = clone();
            const closeBorrowed = borrowed.close.bind(borrowed);
            vi.spyOn(borrowed, 'close').mockImplementation(() => {
              cloneCounts.set(borrowed, (cloneCounts.get(borrowed) ?? 0) + 1);
              closeBorrowed();
              cloneOrigins.delete(borrowed);
              continueRead.resolve();
            });
            cloneCounts.set(borrowed, 0);
            cloneOrigins.set(borrowed, value);
            return borrowed;
          });
          return { done: false, value };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      return iterator;
    },
    dispose: vi.fn(),
  };
  const samples = vi.spyOn(stream, 'samples');
  const provider = createPreviewSourceProvider({ open: async () => stream });
  const first = await provider.acquire([demand(0.02)], signal());
  const pending = provider.acquire([demand(0.32)], signal());
  await reading.promise;
  expect([...cloneCounts.values()]).toEqual([0]);
  expect(backingCount()).toBe(2);
  first?.release();
  const nextFrame = await pending;
  expect(binding(nextFrame)).toMatchObject({ timestamp: 0.3, nextTimestamp: 0.4 });
  expect(samples).toHaveBeenCalledOnce();
  expect(next).toHaveBeenCalledTimes(5);
  expect(originals.size).toBe(2);
  nextFrame?.release();
  provider.dispose();
  expect(originals.size).toBe(0);
  expect([...cloneCounts.values()]).toEqual([1, 1]);
});

it('retires old ring originals before awaiting iterator return while keeping GPU clones charged', async () => {
  const events: string[] = [];
  const clones: VideoSample[] = [];
  const stream: PreviewSourceStream = {
    end: 1,
    samples(start) {
      let index = Math.floor(start * 10);
      const iterator: AsyncIterableIterator<VideoSample> = {
        async next() {
          const value = sample(index++ / 10);
          const close = value.close.bind(value);
          vi.spyOn(value, 'close').mockImplementation(() => {
            events.push(`close:${value.timestamp}`);
            close();
          });
          const clone = value.clone.bind(value);
          vi.spyOn(value, 'clone').mockImplementation(() => {
            const borrowed = clone();
            vi.spyOn(borrowed, 'close');
            clones.push(borrowed);
            return borrowed;
          });
          return { done: false, value };
        },
        async return() {
          events.push('return');
          return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      return iterator;
    },
    dispose: vi.fn(),
  };
  const provider = createPreviewSourceProvider({ open: async () => stream });
  const first = await provider.acquire([demand(0.32)], signal());
  const backward = await provider.acquire([demand(0.02)], signal());
  expect(events.indexOf('close:0.3')).toBeLessThan(events.indexOf('return'));
  expect(events.indexOf('close:0.4')).toBeLessThan(events.indexOf('return'));
  expect(vi.mocked(clones[0]!.close)).not.toHaveBeenCalled();
  expect(binding(first).timestamp).toBe(0.3);
  first?.release();
  backward?.release();
  provider.dispose();
  expect(clones.map((clone) => vi.mocked(clone.close).mock.calls.length)).toEqual([1, 1]);
});

it('keeps the selected terminal bracket alive when its target is within rounding distance of EOF', async () => {
  const f = fixture([0, 0.1, 0.3], 0.5);
  const lease = await f.provider.acquire([demand(0.499999)], signal());
  expect(binding(lease)).toMatchObject({ timestamp: 0.3, nextTimestamp: 0.5 });
  const cached = await f.provider.acquire([demand(0.499999)], signal(), { discontinuity: true });
  expect(binding(cached)).toMatchObject({ timestamp: 0.3, nextTimestamp: 0.5 });
  lease?.release();
  cached?.release();
  f.provider.dispose();
});

it('does not install an aborted discontinuity iterator after its old return settles', async () => {
  const returning = Promise.withResolvers<void>();
  const finishReturn = Promise.withResolvers<void>();
  const starts: number[] = [];
  let firstReturn = true;
  const stream: PreviewSourceStream = {
    end: 100,
    samples(start) {
      starts.push(start);
      let index = Math.floor(start * 10);
      const iterator: AsyncIterableIterator<VideoSample> = {
        async next() {
          return { done: false, value: sample(index++ / 10) };
        },
        async return() {
          if (firstReturn) {
            firstReturn = false;
            returning.resolve();
            await finishReturn.promise;
          }
          return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      return iterator;
    },
    dispose: vi.fn(),
  };
  const provider = createPreviewSourceProvider({ open: async () => stream });
  const initial = await provider.acquire([demand(0.02)], signal());
  initial?.release();
  const controller = new AbortController();
  const replaced = provider
    .acquire([demand(37.5)], controller.signal, { discontinuity: true })
    .catch((error: unknown) => error);
  await returning.promise;
  controller.abort();
  expect(await replaced).toMatchObject({ name: 'AbortError' });
  const latest = provider.acquire([demand(0.02)], signal());
  finishReturn.resolve();
  const lease = await latest;
  expect(binding(lease).timestamp).toBe(0);
  expect(starts).toEqual([0.02, 0.02]);
  lease?.release();
  provider.dispose();
});

it('admits the verified leading sample explicitly while preserving target and original PTS', async () => {
  const f = fixture([1 / 60, 2 / 60, 0.1]);
  Object.assign(f.stream, { leadingSampleTime: 1 / 60 });
  const lease = await f.provider.acquire(
    [{ ...demand(0), rangeStart: 0, rangeEnd: 0.5 }],
    signal()
  );
  expect(binding(lease)).toMatchObject({
    target: 0,
    sampleTime: 1 / 60,
    timestamp: 1 / 60,
    nextTimestamp: 2 / 60,
  });
  expect(f.stream.samples).toHaveBeenCalledWith(1 / 60, 0.5);
  const ordinary = await f.provider.acquire([demand(0.02)], signal());
  expect(binding(ordinary).timestamp).toBe(1 / 60);
  expect(binding(ordinary)).not.toHaveProperty('sampleTime');
  lease?.release();
  ordinary?.release();
  f.provider.dispose();
});

it.each(['missing', 'mismatch', 'outside-end', 'outside-start', 'invalid'] as const)(
  'rejects leading sampling for %s admission',
  async (reason) => {
    const f = fixture([1 / 60, 2 / 60, 0.1]);
    if (reason !== 'missing')
      Object.assign(f.stream, {
        leadingSampleTime: reason === 'mismatch' ? 0.01 : reason === 'invalid' ? NaN : 1 / 60,
      });
    await expect(
      f.provider.acquire(
        [
          {
            ...demand(0),
            rangeStart: reason === 'outside-start' ? 0.02 : 0,
            rangeEnd: reason === 'outside-end' ? 1 / 60 : 0.5,
          },
        ],
        signal()
      )
    ).rejects.toThrow('Preview source frame is unavailable.');
    f.provider.dispose();
  }
);

function defaultLeadingFixture(
  first: number,
  rate = 60,
  resolution = 60000,
  stats?: Promise<{ averagePacketRate: number }>
) {
  const dispose = vi.fn();
  const computePacketStats = vi.fn(async () => (stats ? await stats : { averagePacketRate: rate }));
  const getTimeResolution = vi.fn(async () => resolution);
  const samples = vi.fn(async function* () {
    for (const time of [first, first + 1 / 60, 0.2]) yield sample(time);
  });
  vi.doMock('mediabunny', async (importOriginal) => ({
    ...(await importOriginal<typeof import('mediabunny')>()),
    Input: class {
      dispose = dispose;
      async getPrimaryVideoTrack() {
        return {
          canDecode: async () => true,
          getDecoderConfig: async () => ({ codec: 'avc1.42001f' }),
          computeDuration: async () => 0.5,
          getFirstTimestamp: async () => first,
          getTimeResolution,
          computePacketStats,
        };
      }
    },
    UrlSource: class {},
    VideoSampleSink: class {
      samples = samples;
    },
  }));
  return { dispose, computePacketStats, getTimeResolution, samples };
}

it.each([1 / 60, 0, 0.2, NaN] as const)(
  'bounds default leading admission from metadata for first PTS %s',
  async (first) => {
    const f = defaultLeadingFixture(first);
    const provider = createPreviewSourceProvider();
    try {
      if (first === 1 / 60 || first === 0) {
        const lease = await provider.acquire([demand(0)], signal());
        expect(binding(lease).target).toBe(0);
        expect(binding(lease).timestamp).toBe(first);
        if (first > 0) expect(binding(lease)).toHaveProperty('sampleTime', first);
        else expect(binding(lease)).not.toHaveProperty('sampleTime');
        lease?.release();
      } else
        await expect(provider.acquire([demand(0)], signal())).rejects.toThrow(
          'Preview source frame is unavailable.'
        );
      if (first > 0) {
        expect(f.computePacketStats).toHaveBeenCalledWith(256, { metadataOnly: true });
        expect(f.getTimeResolution).toHaveBeenCalledOnce();
      } else {
        expect(f.computePacketStats).not.toHaveBeenCalled();
        expect(f.getTimeResolution).toHaveBeenCalledOnce();
      }
    } finally {
      provider.dispose();
      vi.doUnmock('mediabunny');
    }
  }
);

it.each([
  [NaN, 60000],
  [0, 60000],
  [60, NaN],
  [60, 0],
])('rejects invalid admission metadata rate=%s resolution=%s', async (rate, resolution) => {
  defaultLeadingFixture(1 / 60, rate, resolution);
  const provider = createPreviewSourceProvider();
  try {
    await expect(provider.acquire([demand(0)], signal())).rejects.toThrow(
      'Preview source frame is unavailable.'
    );
  } finally {
    provider.dispose();
    vi.doUnmock('mediabunny');
  }
});

it('disposes a source cancelled while its bounded metadata probe is pending', async () => {
  const stats = Promise.withResolvers<{ averagePacketRate: number }>();
  const entered = Promise.withResolvers<void>();
  const f = defaultLeadingFixture(1 / 60, 60, 60000, stats.promise);
  f.computePacketStats.mockImplementation(async () => {
    entered.resolve();
    return await stats.promise;
  });
  const provider = createPreviewSourceProvider();
  try {
    const pending = provider.acquire([demand(0)], signal()).catch((error: unknown) => error);
    await entered.promise;
    provider.dispose();
    stats.resolve({ averagePacketRate: 60 });
    expect(await pending).toMatchObject({ name: 'AbortError' });
    // The physical opening continuation checks its cancellation before making a sink.
    await stats.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(f.dispose).toHaveBeenCalledOnce();
    expect(f.samples).not.toHaveBeenCalled();
  } finally {
    provider.dispose();
    vi.doUnmock('mediabunny');
  }
});

it.each(['open', 'decode'] as const)(
  'retains the %s cause behind a fixed source error and controlled summary',
  async (stage) => {
    const cause = new Error('private decoder details');
    const stream: PreviewSourceStream = {
      end: 1,
      samples() {
        return {
          async next(): Promise<IteratorResult<VideoSample>> {
            throw cause;
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
      },
      dispose: vi.fn(),
    };
    const provider = createPreviewSourceProvider({
      open: async () => {
        if (stage === 'open') throw cause;
        return stream;
      },
    });
    const summary = vi.fn();
    const attempt = createReviewExportDiagnostics(
      { destination: 'preview', route: 'render' },
      summary
    );
    try {
      const failure = await attempt
        .phase('decode', () => provider.acquire([demand(0.02)], signal()))
        .catch((value: unknown) => value);
      expect(failure).toMatchObject({
        stage: 'decode',
        cause: {
          message: 'Preview source frame is unavailable.',
          cause,
        },
      });
      attempt.reportFailure(failure);
      expect(summary).toHaveBeenCalledExactlyOnceWith(
        'preview outcome=failed route=render destination=preview stage=decode code=decode-failed'
      );
      expect(summary.mock.calls[0]![0]).not.toContain('private decoder details');
    } finally {
      provider.dispose();
    }
  }
);

it.each([1000, 1e9 / 3_000_000])(
  'keeps strict request intent on the verified %s timestamp grid',
  (resolution) => {
    const end = 700 / resolution;
    const request = {
      id: 'held',
      url: 'blob:grid',
      time: end,
      rangeEnd: end,
      endpoint: 'retained-end' as const,
    };
    const selected = resolvePreviewSourceRequest(request, end + 1, undefined, resolution);
    expect(selected).toMatchObject({
      retainedEnd: end,
      strictEnd: end,
      decodeTime: 699 / resolution,
      lookupTime: 699 / resolution,
    });
    expect(selected.lookupTime).toBeLessThan(end);
    expect(
      resolvePreviewSourceRequest(
        { id: 'ordinary', url: 'blob:grid', time: 0.1 },
        end + 1,
        undefined,
        resolution
      ).lookupTime
    ).toBe(resolvePreviewSourceOrdinaryTime(0.1, end + 1).lookupTime);
  }
);
it('opens an ordinary real source with a fractional container resolution', async () => {
  const f = defaultLeadingFixture(0, 30, 1e9 / 3_000_000);
  const provider = createPreviewSourceProvider();
  const lease = await provider.acquire([demand(0)], signal());
  expect(binding(lease)).toMatchObject({ timestamp: 0, target: 0 });
  expect(f.getTimeResolution).toHaveBeenCalledOnce();
  lease?.release();
  provider.dispose();
});
