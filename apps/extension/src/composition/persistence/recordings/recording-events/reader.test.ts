import '../../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from '../../../../features/video/project/recording-events/fixtures.json';
import { createRecordingEventsBlockPacker } from '../../../../features/video/project/recording-events/blocks';
import { installPersistenceLockManagerForTests } from '../../infrastructure/mutation-barrier';
import { handleDatabaseUpgrade } from '../../infrastructure/indexed-db/upgrade/core';
import {
  DB_VERSION,
  RECORDING_EVENTS_STORE as STORE,
} from '../../infrastructure/indexed-db/core.stores';
import { createRecordingEventsStore } from './store';
import { createRecordingEventsReader, type RecordingEventsFactCursor } from './reader';

const databases: { name: string; db: IDBPDatabase }[] = [];
let sequence = 0;
beforeEach(() =>
  installPersistenceLockManagerForTests({
    request: async (_name, _options, operation) => operation({}),
  })
);
afterEach(async () => {
  vi.restoreAllMocks();
  installPersistenceLockManagerForTests(null);
  for (const { db, name } of databases.splice(0)) {
    db.close();
    await deleteDB(name);
  }
});
async function setup(custom?: unknown[]) {
  const name = `recording-events-reader-${++sequence}`;
  const db = await openDB(name, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  databases.push({ db, name });
  const dependencies = { database: async () => db, mintGeneration: () => crypto.randomUUID() };
  const store = createRecordingEventsStore(dependencies);
  const reader = createRecordingEventsReader(dependencies);
  const identity = { recordingId: fixture.recordingId, eventStreamId: fixture.eventStreamId };
  const writer = await store.begin(identity);
  const packer = createRecordingEventsBlockPacker(identity.recordingId, identity.eventStreamId);
  const blocks = (
    custom ?? fixture.blocks.flatMap<unknown>((block) => block.value.records)
  ).flatMap((record) => packer.append(record));
  blocks.push(...packer.finish());
  for (const block of blocks) await store.append(writer, block);
  const descriptor = {
    ...fixture.descriptor,
    ...(custom ? { state: 'complete' } : {}),
    ...packer.summary(),
  };
  await store.finalize(writer, descriptor);
  return { db, store, reader, identity, writer, descriptor, blocks, dependencies };
}

it('finds delayed source intervals and does not extend a lost key to Stop', async () => {
  const { reader, identity, descriptor } = await setup();
  const page = await reader.readPage({
    identity,
    descriptor,
    fromTimeUs: 200000,
    toTimeUs: 210000,
  });
  expect(page.facts.map((fact) => fact.entryId).sort()).toEqual([
    's:protected-public-stop',
    's:unknown-aggregate-70000',
  ]);
  const unknown = page.facts.find((fact) => fact.entryId === 's:unknown-aggregate-70000');
  expect(unknown?.record).toMatchObject({ signal: { data: { eventCount: 70000 } } });
  const atDown = await reader.readPage({
    identity,
    descriptor,
    fromTimeUs: 180000,
    toTimeUs: 180000,
  });
  expect(atDown.facts.some((fact) => fact.entryId === 'a:key-f5')).toBe(true);
});

it('traverses every overlapping fact once across bounded pages, including empty continuation pages', async () => {
  const records: unknown[] = [fixture.blocks[0]!.value.records[0]!];
  for (let i = 0; i < 150; i++)
    records.push({
      kind: 'signal',
      recordSeq: records.length,
      segmentId: 0,
      activeTimeUs: 254,
      signal: {
        id: `overlap-${i}`,
        kind: 'cursor-idle',
        startTimeUs: 1,
        endTimeUs: 254,
        point: null,
        data: { source: 'browser-cursor' },
      },
    });
  records.push({
    kind: 'boundary',
    recordSeq: records.length,
    segmentId: 0,
    activeTimeUs: 255,
    reason: 'stop',
  });
  const { reader, identity, descriptor } = await setup(records);
  let after: RecordingEventsFactCursor | undefined;
  const ids: string[] = [];
  let emptyContinuation = false;
  let pages = 0;
  do {
    const page = await reader.readPage({
      identity,
      descriptor,
      fromTimeUs: 0,
      toTimeUs: 255,
      limit: 17,
      ...(after ? { after } : {}),
    });
    expect(page.facts.length).toBeLessThanOrEqual(17);
    ids.push(...page.facts.map((fact) => fact.entryId));
    if (!page.facts.length && page.next) emptyContinuation = true;
    after = page.next ?? undefined;
    expect(++pages).toBeLessThan(100);
  } while (after);
  expect(ids).toHaveLength(150);
  expect(new Set(ids).size).toBe(150);
  expect(emptyContinuation).toBe(true);
}, 60000);

it.each(['query', 'source', 'digest', 'generation', 'position'] as const)(
  'refuses a continuation with changed %s',
  async (failure) => {
    const { reader, identity, descriptor } = await setup();
    const query = { identity, descriptor, fromTimeUs: 0, toTimeUs: 1000000, limit: 1 };
    const first = await reader.readPage(query);
    if (!first.next) throw new Error('Missing continuation.');
    const after = structuredClone(first.next);
    if (failure === 'query') after.fromTimeUs++;
    if (failure === 'source') after.recordingId = 'another-recording';
    if (failure === 'digest') after.streamSha256 = 'b'.repeat(64);
    if (failure === 'generation') after.writerGeneration = 'old-generation';
    if (failure === 'position') after.entryId = 'a:missing';
    await expect(reader.readPage({ ...query, after })).rejects.toThrow();
  }
);

it('fences a continuation after deletion and restoration of identical source bytes', async () => {
  const { reader, store, identity, writer, descriptor, blocks } = await setup();
  const query = { identity, descriptor, fromTimeUs: 0, toTimeUs: 1000000, limit: 1 };
  const first = await reader.readPage(query);
  await store.retire(identity, writer.writerGeneration);
  const restored = await store.restore(identity);
  for (const block of blocks) await store.append(restored, block);
  await store.finalize(restored, descriptor);
  await expect(reader.readPage({ ...query, after: first.next })).rejects.toThrow();
  expect((await reader.readPage(query)).writerGeneration).toBe(restored.writerGeneration);
});

it('cancels a delayed read without changing or repairing accepted data', async () => {
  const { reader, store, identity, descriptor, dependencies, db } = await setup();
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(dependencies, 'database').mockImplementationOnce(async () => {
    enter();
    await gate;
    return db;
  });
  const controller = new AbortController();
  const read = reader.readPage({
    identity,
    descriptor,
    fromTimeUs: 0,
    toTimeUs: 1000000,
    signal: controller.signal,
  });
  const refused = expect(read).rejects.toThrow();
  await entered;
  const before = await store.getHead(identity);
  controller.abort();
  release();
  await refused;
  expect(await store.getHead(identity)).toEqual(before);
});

it('refuses corrupt derived query metadata while retaining its original source blocks', async () => {
  const { reader, identity, descriptor, store, db, blocks } = await setup();
  const key = [identity.recordingId, identity.eventStreamId, 'fact', 's:protected-public-stop'];
  const fact = await db.get(STORE, key);
  await db.put(STORE, { ...fact, fromTimeUs: 1 });
  const before = await store.getHead(identity);
  await expect(
    reader.readPage({ identity, descriptor, fromTimeUs: 200000, toTimeUs: 210000 })
  ).rejects.toThrow();
  expect(await store.getHead(identity)).toEqual(before);
  expect((await store.readBlock(identity, 0))?.bytes).toEqual(blocks[0]?.bytes);
});
