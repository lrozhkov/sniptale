import { expect, it, vi } from 'vitest';
import { VideoSample } from 'mediabunny';
import {
  createPreviewSourceProvider,
  type PreviewSourceLease,
  type PreviewSourceStream,
} from './preview-source';

const signal = () => new AbortController().signal;
const demand = (time: number, rangeEnd = 1) => ({
  id: 'terminal',
  url: 'blob:source',
  time,
  rangeStart: 0,
  rangeEnd,
  holdEnd: true,
});
function binding(lease: PreviewSourceLease | null) {
  const value = lease?.bindings.get('terminal');
  if (!value) throw new Error('Missing terminal source lease.');
  return value;
}
function fixture(timestamps = [0, 0.1, 0.3, 0.9], end = 1) {
  const starts: number[] = [];
  const originals: VideoSample[] = [];
  const clones: VideoSample[] = [];
  const stream: PreviewSourceStream = {
    end,
    async *samples(start) {
      starts.push(start);
      const first = Math.max(
        0,
        timestamps.findLastIndex((time) => time <= start)
      );
      for (const timestamp of timestamps.slice(first)) {
        const sample = new VideoSample(new Uint8Array(16), {
          format: 'RGBA',
          codedWidth: 2,
          codedHeight: 2,
          timestamp,
          duration: 0.001,
        });
        vi.spyOn(sample, 'close');
        const clone = sample.clone.bind(sample);
        vi.spyOn(sample, 'clone').mockImplementation(() => {
          const borrowed = clone();
          vi.spyOn(borrowed, 'close');
          clones.push(borrowed);
          return borrowed;
        });
        originals.push(sample);
        yield sample;
      }
    },
    dispose: vi.fn(),
  };
  const open = vi.fn(async () => stream);
  const provider = createPreviewSourceProvider({ open });
  return { provider, stream, open, starts, originals, clones };
}

it.each(['cold', 'warm'] as const)(
  'holds the original last frame at %s EOF and through a bounded audio tail',
  async (temperature) => {
    const f = fixture();
    if (temperature === 'warm') (await f.provider.acquire([demand(0.32)], signal()))?.release();
    for (const target of [1, 1.2, 1.5]) {
      const lease = await f.provider.acquire([demand(target, 1.5)], signal());
      expect(binding(lease)).toMatchObject({
        target,
        timestamp: 0.9,
        nextTimestamp: 1,
        heldAtEnd: true,
      });
      expect(binding(lease)).not.toHaveProperty('sampleTime');
      lease?.release();
    }
    expect(f.open).toHaveBeenCalledOnce();
    if (temperature === 'cold') expect(f.starts[0]).toBe(1 - Number.EPSILON / 2);
    expect(f.starts).toHaveLength(1);
    f.provider.dispose();
    expect(f.originals.every((sample) => vi.mocked(sample.close).mock.calls.length === 1)).toBe(
      true
    );
  }
);

it.each([
  { id: 'terminal', url: 'blob:source', time: 1, holdEnd: true },
  demand(1, Infinity),
  demand(1, NaN),
  demand(1.6, 1.5),
  { ...demand(1), rangeStart: 1 },
])('rejects invalid or absent terminal bounds before opening: %j', async (input) => {
  const f = fixture();
  await expect(f.provider.acquire([input], signal())).rejects.toThrow(
    'Preview source frame is unavailable.'
  );
  expect(f.open).not.toHaveBeenCalled();
  f.provider.dispose();
});

it('keeps ordinary EOF strict and does not label ordinary flagged samples as held', async () => {
  const f = fixture();
  await expect(
    f.provider.acquire([{ ...demand(1, 1.5), holdEnd: false }], signal())
  ).rejects.toThrow('Preview source frame is unavailable.');
  const lease = await f.provider.acquire([demand(0.32)], signal());
  expect(binding(lease)).toMatchObject({ target: 0.32, timestamp: 0.3, nextTimestamp: 0.9 });
  expect(binding(lease)).not.toHaveProperty('heldAtEnd');
  expect(binding(lease)).not.toHaveProperty('sampleTime');
  lease?.release();
  f.provider.dispose();
});

it('rejects a terminal sample excluded by the retained source range', async () => {
  const f = fixture();
  await expect(f.provider.acquire([{ ...demand(1), rangeStart: 0.95 }], signal())).rejects.toThrow(
    'Preview source frame is unavailable.'
  );
  f.provider.dispose();
});

it('keeps leading admission separate from terminal holding', async () => {
  const f = fixture([1 / 60, 0.1, 0.9]);
  Object.assign(f.stream, { leadingSampleTime: 1 / 60 });
  const leading = await f.provider.acquire([demand(0)], signal());
  expect(binding(leading)).toMatchObject({ target: 0, timestamp: 1 / 60, sampleTime: 1 / 60 });
  expect(binding(leading)).not.toHaveProperty('heldAtEnd');
  leading?.release();
  const terminal = await f.provider.acquire([demand(1)], signal());
  expect(binding(terminal)).toMatchObject({ target: 1, timestamp: 0.9, heldAtEnd: true });
  expect(binding(terminal)).not.toHaveProperty('sampleTime');
  terminal?.release();
  f.provider.dispose();
});

it('replays backwards with the same source and preserves terminal GPU clones through disposal', async () => {
  const f = fixture();
  const terminal = await f.provider.acquire([demand(1)], signal());
  const replay = await f.provider.acquire([demand(0.02)], signal(), { discontinuity: true });
  expect(binding(replay)).toMatchObject({ target: 0.02, timestamp: 0 });
  expect(binding(replay)).not.toHaveProperty('heldAtEnd');
  expect(f.open).toHaveBeenCalledOnce();
  expect(f.starts).toHaveLength(2);
  f.provider.dispose();
  expect(f.clones.map((sample) => vi.mocked(sample.close).mock.calls.length)).toEqual([0, 0]);
  terminal?.release();
  replay?.release();
  terminal?.release();
  expect(f.clones.map((sample) => vi.mocked(sample.close).mock.calls.length)).toEqual([1, 1]);
});

it('withdraws cancelled terminal interest without changing the queued replay target', async () => {
  const f = fixture();
  f.provider.dispose();
  const opened = Promise.withResolvers<void>();
  const opening = Promise.withResolvers<PreviewSourceStream>();
  const open = vi.fn(async () => {
    opened.resolve();
    return await opening.promise;
  });
  const provider = createPreviewSourceProvider({ open });
  const controller = new AbortController();
  const terminal = provider
    .acquire([demand(1)], controller.signal)
    .catch((error: unknown) => error);
  await opened.promise;
  controller.abort();
  expect(await terminal).toMatchObject({ name: 'AbortError' });
  const replay = provider.acquire([demand(0.02)], signal());
  opening.resolve(f.stream);
  const lease = await replay;
  expect(binding(lease)).toMatchObject({ target: 0.02, timestamp: 0 });
  expect(binding(lease)).not.toHaveProperty('heldAtEnd');
  expect(open).toHaveBeenCalledOnce();
  lease?.release();
  provider.dispose();
});

it.each([1 - 0.000001, 1 - 0.000002, 1, 1 + 0.000001])(
  'admits explicitly bounded media endpoint rounding at %s without retiming source facts',
  async (mediaEnd) => {
    const f = fixture();
    const lease = await f.provider.acquire([demand(mediaEnd, mediaEnd)], signal());
    expect(binding(lease)).toMatchObject({
      target: mediaEnd,
      timestamp: 0.9,
      nextTimestamp: 1,
      heldAtEnd: true,
    });
    expect(f.starts[0]).toBeLessThan(Math.min(1, mediaEnd));
    lease?.release();
    f.provider.dispose();
  }
);

it.each([0.5, 1 - 0.000003])(
  'rejects a genuinely interior inclusive retained endpoint %s',
  async (rangeEnd) => {
    const f = fixture();
    await expect(f.provider.acquire([demand(rangeEnd, rangeEnd)], signal())).rejects.toThrow(
      'Preview source frame is unavailable.'
    );
    f.provider.dispose();
  }
);

it.each(['cold', 'warm', 'pruned'] as const)(
  'holds the retained predecessor from a %s source',
  async (mode) => {
    const f = fixture([0, 0.3, 0.5, 0.9]);
    if (mode === 'warm') (await f.provider.acquire([demand(0.32)], signal()))?.release();
    if (mode === 'pruned') (await f.provider.acquire([demand(0.6)], signal()))?.release();
    const request = { ...demand(0.5, 0.5), holdEnd: false, endpoint: 'retained-end' as const };
    const lease = await f.provider.acquire([request], signal());
    expect(binding(lease)).toMatchObject({
      target: 0.5,
      timestamp: 0.3,
      nextTimestamp: 0.5,
      heldAtRetainedEnd: true,
    });
    expect(binding(lease)).not.toHaveProperty('heldAtEnd');
    expect(binding(lease)).not.toHaveProperty('sampleTime');
    f.provider.dispose();
    expect(f.clones.at(-1)!.close).not.toHaveBeenCalled();
    lease?.release();
    lease?.release();
    expect(f.clones.at(-1)!.close).toHaveBeenCalledOnce();
  }
);

it('keeps mixed ordinary and retained endpoint requests on their actual intervals', async () => {
  const f = fixture([0, 0.3, 0.5, 0.9]);
  const lease = await f.provider.acquire(
    [
      { ...demand(0.5, 0.5), holdEnd: false, endpoint: 'retained-end' as const },
      { id: 'ordinary', url: 'blob:source', time: 0.5 },
    ],
    signal()
  );
  expect(binding(lease)).toMatchObject({
    timestamp: 0.3,
    nextTimestamp: 0.5,
    target: 0.5,
    heldAtRetainedEnd: true,
  });
  expect(lease?.bindings.get('ordinary')).toMatchObject({
    timestamp: 0.5,
    nextTimestamp: 0.9,
    target: 0.5,
  });
  expect(lease?.bindings.get('ordinary')).not.toHaveProperty('heldAtRetainedEnd');
  lease?.release();
  f.provider.dispose();
});

it.each([0.4, 1, 1.2])('holds a bounded retained endpoint at %s without retiming', async (end) => {
  const f = fixture();
  const lease = await f.provider.acquire(
    [{ ...demand(end, end), holdEnd: false, endpoint: 'retained-end' as const }],
    signal()
  );
  expect(binding(lease)).toMatchObject({
    target: end,
    timestamp: end === 0.4 ? 0.3 : 0.9,
    nextTimestamp: end === 0.4 ? 0.9 : 1,
    heldAtRetainedEnd: true,
  });
  lease?.release();
  f.provider.dispose();
});

it.each([
  { ...demand(0.5, 0.5), endpoint: 'retained-end' as const },
  { ...demand(0.4, 0.5), holdEnd: false, endpoint: 'retained-end' as const },
  { ...demand(0, 0), holdEnd: false, endpoint: 'retained-end' as const },
])('rejects invalid retained endpoint intent %j before opening', async (request) => {
  const f = fixture();
  await expect(f.provider.acquire([request], signal())).rejects.toThrow(
    'Preview source frame is unavailable.'
  );
  expect(f.open).not.toHaveBeenCalled();
  f.provider.dispose();
});

it.each([0.499999, 0.5, 0.500001])('keeps strict retained membership at %s', async (end) => {
  const f = fixture([0, 0.3, 0.5, 0.9]);
  (await f.provider.acquire([demand(0.32)], signal()))?.release();
  const lease = await f.provider.acquire(
    [{ ...demand(end, end), holdEnd: false, endpoint: 'retained-end' as const }],
    signal()
  );
  expect(binding(lease)).toMatchObject({
    target: end,
    timestamp: end <= 0.5 ? 0.3 : 0.5,
    nextTimestamp: end <= 0.5 ? 0.5 : 0.9,
  });
  lease?.release();
  f.provider.dispose();
});

it('restarts a pruned predecessor after an ordinary request in the same acquisition', async () => {
  const f = fixture([0, 0.3, 0.5, 0.9]);
  const lease = await f.provider.acquire(
    [
      { id: 'ordinary', url: 'blob:source', time: 0.5 },
      { ...demand(0.5, 0.5), holdEnd: false, endpoint: 'retained-end' as const },
    ],
    signal()
  );
  expect(lease?.bindings.get('ordinary')).toMatchObject({ timestamp: 0.5, nextTimestamp: 0.9 });
  expect(binding(lease)).toMatchObject({
    timestamp: 0.3,
    nextTimestamp: 0.5,
    heldAtRetainedEnd: true,
  });
  expect(f.starts).toHaveLength(2);
  expect(f.clones.every((sample) => vi.mocked(sample.close).mock.calls.length === 0)).toBe(true);
  f.provider.dispose();
  lease?.release();
  expect(f.clones.every((sample) => vi.mocked(sample.close).mock.calls.length === 1)).toBe(true);
});

it('releases a retained endpoint loan when a later ordinary demand fails', async () => {
  const f = fixture();
  await expect(
    f.provider.acquire(
      [
        { ...demand(0.5, 0.5), holdEnd: false, endpoint: 'retained-end' as const },
        { id: 'ordinary', url: 'blob:source', time: 1 },
      ],
      signal()
    )
  ).rejects.toThrow('Preview source frame is unavailable.');
  expect(f.clones).toHaveLength(1);
  expect(f.clones[0]!.close).toHaveBeenCalledOnce();
  f.provider.dispose();
});

it.each(['cold', 'warm', 'pruned'] as const)(
  'holds verified whole-source EOF from a %s source',
  async (mode) => {
    const f = fixture();
    if (mode === 'warm') (await f.provider.acquire([demand(0.32)], signal()))?.release();
    if (mode === 'pruned') (await f.provider.acquire([demand(0.95)], signal()))?.release();
    const request = { id: 'terminal', url: 'blob:source', time: 12, holdSourceEnd: true as const };
    const lease = await f.provider.acquire([request], signal());
    expect(binding(lease)).toMatchObject({
      target: 12,
      timestamp: 0.9,
      nextTimestamp: 1,
      heldAtEnd: true,
    });
    expect(binding(lease)).not.toHaveProperty('heldAtRetainedEnd');
    expect(binding(lease)).not.toHaveProperty('sampleTime');
    f.provider.dispose();
    expect(f.clones.at(-1)!.close).not.toHaveBeenCalled();
    lease?.release();
    expect(f.clones.at(-1)!.close).toHaveBeenCalledOnce();
  }
);

it('keeps whole-source hold ordinary before verified EOF', async () => {
  const f = fixture();
  const request = { id: 'terminal', url: 'blob:source', time: 0.32, holdSourceEnd: true as const };
  const lease = await f.provider.acquire([request], signal());
  expect(binding(lease)).toMatchObject({ target: 0.32, timestamp: 0.3, nextTimestamp: 0.9 });
  expect(binding(lease)).not.toHaveProperty('heldAtEnd');
  lease?.release();
  f.provider.dispose();
});

it.each([{ holdEnd: true }, { endpoint: 'retained-end' as const }, { rangeEnd: 1 }])(
  'rejects competing whole-source terminal intent %j',
  async (conflict) => {
    const f = fixture();
    const request = {
      id: 'terminal',
      url: 'blob:source',
      time: 0.32,
      holdSourceEnd: true as const,
      ...conflict,
    };
    await expect(f.provider.acquire([request], signal())).rejects.toThrow(
      'Preview source frame is unavailable.'
    );
    expect(f.open).not.toHaveBeenCalled();
    f.provider.dispose();
  }
);

it('keeps whole-source leading admission separate from terminal holding', async () => {
  const f = fixture([1 / 60, 0.1, 0.9]);
  Object.assign(f.stream, { leadingSampleTime: 1 / 60 });
  const lease = await f.provider.acquire(
    [{ id: 'terminal', url: 'blob:source', time: 0, holdSourceEnd: true }],
    signal()
  );
  expect(binding(lease)).toMatchObject({ target: 0, timestamp: 1 / 60, sampleTime: 1 / 60 });
  expect(binding(lease)).not.toHaveProperty('heldAtEnd');
  lease?.release();
  f.provider.dispose();
});

it('keeps mixed ordinary and whole-source terminal loans alive through disposal', async () => {
  const f = fixture();
  const lease = await f.provider.acquire(
    [
      { id: 'ordinary', url: 'blob:source', time: 0.32 },
      { id: 'terminal', url: 'blob:source', time: 12, holdSourceEnd: true },
    ],
    signal()
  );
  expect(lease?.bindings.get('ordinary')).toMatchObject({
    target: 0.32,
    timestamp: 0.3,
    nextTimestamp: 0.9,
  });
  expect(binding(lease)).toMatchObject({
    target: 12,
    timestamp: 0.9,
    nextTimestamp: 1,
    heldAtEnd: true,
  });
  f.provider.dispose();
  expect(f.clones).toHaveLength(2);
  expect(f.clones.every((sample) => vi.mocked(sample.close).mock.calls.length === 0)).toBe(true);
  lease?.release();
  lease?.release();
  expect(f.clones.every((sample) => vi.mocked(sample.close).mock.calls.length === 1)).toBe(true);
});
