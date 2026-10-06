import { afterEach, expect, it, vi } from 'vitest';
import { createExportTimeHistory, EXPORT_TIME_HISTORY_KEY } from './index';
import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';

afterEach(() => installPersistenceLockManagerForTests(null));

const profile = 'project-render-mp4-avc-p8-f30-qHIGH-c1';
const time = 100 * 24 * 60 * 60 * 1000;
function fixture(value: unknown = undefined) {
  let stored = value;
  const get = vi.fn(async () => ({ [EXPORT_TIME_HISTORY_KEY]: stored }));
  const set = vi.fn(async (items: Record<string, unknown>) => {
    stored = items[EXPORT_TIME_HISTORY_KEY];
  });
  const controller = new AbortController();
  const history = createExportTimeHistory({
    browserStorage: { local: { get, set, remove: vi.fn(), isAvailable: () => true } },
    now: () => time,
    withLock: async (operation) => operation(),
  });
  return { history, get, set, controller, signal: controller.signal };
}

it('persists one successful numeric observation and isolates profiles', async () => {
  const f = fixture();
  await f.history.record(profile, [1.2], f.signal);
  expect(await f.history.read(profile, f.signal)).toEqual([1.2]);
  expect(await f.history.read(profile.replace('avc', 'hevc'), f.signal)).toEqual([]);
  expect(f.set.mock.calls[0]?.[0]).toEqual({
    [EXPORT_TIME_HISTORY_KEY]: {
      version: 1,
      rows: [{ profile, at: time, ratio: 1.2 }],
    },
  });
});

it('keeps only ten latest rows per profile and 100 globally', async () => {
  const f = fixture();
  for (let pixel = 1; pixel <= 12; pixel++) {
    for (let ratio = 1; ratio <= 12; ratio++)
      await f.history.record(profile.replace('p8', `p${pixel}`), [ratio / 4], f.signal);
  }
  expect(await f.history.read(profile.replace('p8', 'p12'), f.signal)).toHaveLength(10);
  const last = f.set.mock.calls.at(-1)?.[0]?.[EXPORT_TIME_HISTORY_KEY];
  expect(last).toMatchObject({ rows: expect.any(Array) });
  expect(JSON.stringify(last).match(/"ratio"/g)).toHaveLength(100);
});

it.each([
  { version: 2, rows: [] },
  { version: 1, rows: new Array(101).fill({ profile, at: time, ratio: 1 }) },
  { version: 1, rows: [{ profile, at: time, ratio: NaN }] },
  { version: 1, rows: [{ profile: 'private filename', at: time, ratio: 1 }] },
  { version: 1, rows: [{ profile, at: time + 1, ratio: 1 }] },
  { version: 1, rows: [{ profile, at: 1, ratio: 1 }] },
])('ignores malformed, future or expired history without repairing on read', async (value) => {
  const f = fixture(value);
  expect(await f.history.read(profile, f.signal)).toEqual([]);
  expect(f.set).not.toHaveBeenCalled();
});

it.each([
  'private filename',
  profile.replace('p8', 'p257'),
  profile.replace('f30', 'f241'),
  profile.replace('c1', 'c17'),
])('refuses unbounded or identifying profile %s', async (invalid) => {
  const f = fixture();
  await f.history.record(invalid, [1], f.signal);
  expect(await f.history.read(invalid, f.signal)).toEqual([]);
  expect(f.get).not.toHaveBeenCalled();
});

it('ignores empty, multiple and invalid ratio results', async () => {
  const f = fixture();
  for (const ratios of [[], [1, 2], [Infinity], [0], [21]])
    await f.history.record(profile, ratios, f.signal);
  expect(f.get).not.toHaveBeenCalled();
});

it('ignores cancellation before and during history reads and writes', async () => {
  const f = fixture({ version: 1, rows: [{ profile, at: time, ratio: 1 }] });
  f.get.mockImplementationOnce(async () => {
    f.controller.abort();
    return { [EXPORT_TIME_HISTORY_KEY]: { version: 1, rows: [{ profile, at: time, ratio: 1 }] } };
  });
  expect(await f.history.read(profile, f.signal)).toEqual([]);
  await f.history.record(profile, [1], f.signal);
  expect(f.set).not.toHaveBeenCalled();
  const write = fixture();
  write.get.mockImplementationOnce(async () => {
    write.controller.abort();
    return { [EXPORT_TIME_HISTORY_KEY]: undefined };
  });
  await write.history.record(profile, [1], write.signal);
  expect(write.set).not.toHaveBeenCalled();
});

it('fails softly when storage or lock coordination is unavailable', async () => {
  const f = fixture();
  f.get.mockRejectedValue(new Error('unavailable'));
  expect(await f.history.read(profile, f.signal)).toEqual([]);
  await expect(f.history.record(profile, [1], f.signal)).resolves.toBeUndefined();
  const blocked = createExportTimeHistory({
    browserStorage: { local: { get: f.get, set: f.set, remove: vi.fn(), isAvailable: () => true } },
    withPermit: async () => null,
  });
  f.get.mockClear();
  await blocked.record(profile, [1], f.signal);
  expect(f.get).not.toHaveBeenCalled();
});

it('reloads within the lock and drops a competing advisory write rather than queueing it', async () => {
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  });
  const f = fixture();
  let locked = false;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const owner = createExportTimeHistory({
    browserStorage: { local: { get: f.get, set: f.set, remove: vi.fn(), isAvailable: () => true } },
    now: () => time,
    withLock: async (operation) => {
      if (locked) return;
      locked = true;
      await waiting;
      await operation();
      locked = false;
    },
  });
  const first = owner.record(profile, [1.2], f.signal);
  await vi.waitFor(() => expect(locked).toBe(true));
  const second = owner.record(profile, [1.4], f.signal);
  release();
  await Promise.all([first, second]);
  expect(f.set).toHaveBeenCalledTimes(1);
  expect(await owner.read(profile, f.signal)).toEqual([1.2]);
});

it('drops retention-expired rows on the next successful write and removes unknown fields', async () => {
  const f = fixture({
    version: 1,
    rows: [
      { profile, at: 1, ratio: 1 },
      { profile, at: time, ratio: 2, filename: 'not retained' },
    ],
  });
  await f.history.record(profile, [1.5], f.signal);
  expect(await f.history.read(profile, f.signal)).toEqual([1.5, 2]);
  expect(JSON.stringify(f.set.mock.calls[0])).not.toContain('not retained');
});
