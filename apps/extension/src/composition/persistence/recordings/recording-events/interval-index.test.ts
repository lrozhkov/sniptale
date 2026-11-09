import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { expect, it } from 'vitest';
import {
  recordingEventIntervalBuckets,
  recordingEventIntervalQuery,
  firstRecordingEventIntervalMatch,
  isRecordingEventIntervalBucket,
} from './interval-index';

it.each([
  [0, 0],
  [1, 1],
  [2, 3],
  [3, 70],
  [0, Number.MAX_SAFE_INTEGER],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  [1, Number.MAX_SAFE_INTEGER - 1],
])('covers source interval %s through %s exactly with bounded integer nodes', (from, to) => {
  const buckets = recordingEventIntervalBuckets(from, to);
  expect(buckets.length).toBeLessThanOrEqual(106);
  expect(buckets.every(isRecordingEventIntervalBucket)).toBe(true);
  const intervals = buckets
    .map(([level, index]) => ({
      from: BigInt(index) * (1n << BigInt(level)),
      to: (BigInt(index) + 1n) * (1n << BigInt(level)) - 1n,
    }))
    .sort((a, b) => (a.from < b.from ? -1 : 1));
  expect(intervals[0]?.from).toBe(BigInt(from));
  expect(intervals.at(-1)?.to).toBe(BigInt(to));
  for (let i = 1; i < intervals.length; i++)
    expect(intervals[i]!.from).toBe(intervals[i - 1]!.to + 1n);
});

it('finds delayed, overlapping and long intervals once without a lifetime deduplication set', () => {
  // This deterministic sequence includes intervals whose emission order differs from time order.
  let seed = 0x81736;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let n = 0; n < 10_000; n++) {
    const from = next() % 1_000_000;
    const to = from + (next() % 1_000_000);
    const queryFrom = next() % 2_000_000;
    const queryTo = queryFrom + (next() % 100_000);
    const buckets = recordingEventIntervalBuckets(from, to);
    const ranges = recordingEventIntervalQuery(queryFrom, queryTo);
    expect(ranges).toHaveLength(54);
    const hits = buckets.filter(
      ([level, index]) => index >= ranges[level]!.from && index <= ranges[level]!.to
    );
    const first = firstRecordingEventIntervalMatch(buckets, queryFrom, queryTo);
    const intersects = from <= queryTo && to >= queryFrom;
    expect(first !== null).toBe(intersects);
    expect(hits.length > 0).toBe(intersects);
    expect(
      hits.filter((bucket) => first && bucket[0] === first[0] && bucket[1] === first[1])
    ).toHaveLength(intersects ? 1 : 0);
  }
});

it('retains microsecond precision above 32-bit and near the safe integer boundary', () => {
  const end = Number.MAX_SAFE_INTEGER;
  const buckets = recordingEventIntervalBuckets(end - 1000, end);
  expect(firstRecordingEventIntervalMatch(buckets, end - 1001, end - 1001)).toBeNull();
  expect(firstRecordingEventIntervalMatch(buckets, end - 1000, end - 1000)).not.toBeNull();
  expect(firstRecordingEventIntervalMatch(buckets, end, end)).not.toBeNull();
  expect(recordingEventIntervalBuckets(2 ** 40 + 1, 2 ** 40 + 1)).toEqual([[0, 2 ** 40 + 1]]);
});

it.each([
  [-1, 0],
  [1, 0],
  [0, Infinity],
  [0.1, 1],
  [0, Number.MAX_SAFE_INTEGER + 1],
])('refuses invalid interval %s through %s', (from, to) => {
  expect(() => recordingEventIntervalBuckets(from, to)).toThrow();
  expect(() => recordingEventIntervalQuery(from, to)).toThrow();
  expect(() => firstRecordingEventIntervalMatch([[0, 0]], from, to)).toThrow();
});

it.each(
  [[], [54, 0], [53, 1], [0, -1], [0.1, 0], [0, Number.MAX_SAFE_INTEGER + 1], [0, 0, 0]].map(
    (value) => ({ value })
  )
)('refuses invalid stored bucket $value', ({ value }) => {
  expect(isRecordingEventIntervalBucket(value)).toBe(false);
});

it('queries the actual multiEntry store without missing delayed intervals or emitting duplicate facts', async () => {
  const { openDB, deleteDB } = await import('idb');
  const { handleDatabaseUpgrade } = await import('../../infrastructure/indexed-db/upgrade/core');
  const { DB_VERSION, RECORDING_EVENTS_STORE } =
    await import('../../infrastructure/indexed-db/core.stores');
  const name = 'recording-events-interval-index';
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  const eventStreamId = 'a'.repeat(32);
  const facts = [
    { id: 'early', from: 1, to: 1 },
    { id: 'late-aggregate', from: 10, to: 900000 },
    { id: 'instant', from: 250000, to: 250000 },
    { id: 'after', from: 900001, to: 900002 },
  ];
  try {
    for (const fact of facts)
      await db.put(RECORDING_EVENTS_STORE, {
        recordingId: 'recording',
        eventStreamId,
        kind: 'fact',
        entryId: fact.id,
        buckets: recordingEventIntervalBuckets(fact.from, fact.to),
        timeBuckets: recordingEventIntervalBuckets(fact.from, fact.to).map(([level, index]) => [
          'recording',
          eventStreamId,
          level,
          index,
        ]),
      });
    const tx = db.transaction(RECORDING_EVENTS_STORE, 'readonly');
    const index = tx.store.index('timeBuckets');
    const emitted: string[] = [];
    for (const query of recordingEventIntervalQuery(250000, 250010)) {
      const range = IDBKeyRange.bound(
        ['recording', eventStreamId, query.level, query.from],
        ['recording', eventStreamId, query.level, query.to]
      );
      let cursor = await index.openCursor(range);
      while (cursor) {
        const first = firstRecordingEventIntervalMatch(cursor.value.buckets, 250000, 250010);
        const key = cursor.key;
        if (first && Array.isArray(key) && key[2] === first[0] && key[3] === first[1])
          emitted.push(cursor.value.entryId);
        cursor = await cursor.continue();
      }
    }
    await tx.done;
    expect(emitted.sort()).toEqual(['instant', 'late-aggregate']);
    expect(db.transaction(RECORDING_EVENTS_STORE).store.keyPath).toEqual([
      'recordingId',
      'eventStreamId',
      'kind',
      'entryId',
    ]);
  } finally {
    db.close();
    await deleteDB(name);
  }
});
