import { expect, it } from 'vitest';
import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js';
import { createEventHistory, EVENT_HISTORY_ARCHIVE_BYTES } from './event-history';
import type { EventHistoryDatabase } from './event-history-database';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { runtimeLogJsonl } from './model';
import { readEventSegment, compressEventSegment, EVENT_SEGMENT_BYTES } from './event-history-zip';

function fixture() {
  let now = Date.UTC(2026, 9, 9);
  let state: unknown;
  let active: string[] = [];
  const catalog = new Map<string, unknown>();
  const blobs = new Map<string, Blob>();
  let failCommit = false;
  const db: EventHistoryDatabase = {
    readState: async () => structuredClone(state),
    readActive: async () => [...active],
    list: async () => [...catalog.values()],
    readArchive: async (id) => blobs.get(id),
    async commit(next, text, replaceActive, archive, remove) {
      if (failCommit) throw new Error('quota');
      state = next;
      if (replaceActive) active = [];
      if (text) active.push(text);
      if (archive) {
        catalog.set(archive.id, archive.metadata);
        blobs.set(archive.id, archive.blob);
      }
      for (const id of remove) {
        catalog.delete(id);
        blobs.delete(id);
      }
    },
    async erase() {
      state = undefined;
      active = [];
      catalog.clear();
      blobs.clear();
    },
    verifyEmpty: async () => state === undefined && !catalog.size && !blobs.size,
  };
  let queue = Promise.resolve();
  const withLock = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
  const history = () =>
    createEventHistory({ database: db, now: () => now, withLock, legacy: async () => '' });
  const rows = (count: number, message = 'Safe summary') =>
    runtimeLogJsonl(
      Array.from({ length: count }, () => ({
        schemaVersion: 1,
        time: new Date(now).toISOString(),
        lastTime: new Date(now).toISOString(),
        source: 'Capture',
        context: 'page',
        level: 'debug',
        message,
        repeats: 1,
        dropped: 0,
      }))
    );
  return {
    db,
    history,
    rows,
    catalog,
    blobs,
    advance: (days: number) => {
      now += days * 86400000;
    },
    fail: () => {
      failCommit = true;
    },
  };
}
const append = (history: ReturnType<typeof createEventHistory>, text: string) =>
  runWithPersistenceMutationPermit((permit) => history.append(text, permit));
async function unzip(blob: Blob) {
  const reader = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
  try {
    const texts: string[] = [];
    for (const entry of await reader.getEntries()) {
      if (!entry.directory)
        texts.push(await entry.getData(new TextWriter(), { checkSignature: true }));
    }
    return texts.join('');
  } finally {
    await reader.close();
  }
}
it('rotates by size/day and exports ordinary JSONL from all segments', async () => {
  const f = fixture();
  const history = f.history();
  const message = 'safe summary '.repeat(70);
  const count =
    Math.floor(EVENT_SEGMENT_BYTES / new TextEncoder().encode(f.rows(1, message)).byteLength / 2) +
    1;
  for (let i = 0; i < 3; i++) expect(await append(history, f.rows(count, message))).toBe(true);
  expect(f.catalog.size).toBe(2);
  f.advance(1);
  await append(history, f.rows(1));
  expect(f.catalog.size).toBe(3);
  expect((await unzip(await history.exportZip())).trim().split('\n')).toHaveLength(count * 3 + 1);
});
it('serializes concurrent contexts and keeps the old complete state on failed publication', async () => {
  const f = fixture();
  await Promise.all([append(f.history(), f.rows(2)), append(f.history(), f.rows(3))]);
  expect((await unzip(await f.history().exportZip())).trim().split('\n')).toHaveLength(5);
  f.advance(1);
  f.fail();
  expect(await append(f.history(), f.rows(1))).toBe(false);
  expect((await unzip(await f.history().exportZip())).trim().split('\n')).toHaveLength(5);
});
it('excludes expired rows on export without writes, then removes expired archives on append', async () => {
  const f = fixture();
  await append(f.history(), f.rows(1));
  f.advance(1);
  await append(f.history(), f.rows(1));
  expect(f.catalog.size).toBe(1);
  f.advance(14);
  expect(await unzip(await f.history().exportZip())).toBe('');
  expect(f.catalog.size).toBe(1);
  await append(f.history(), f.rows(1));
  expect(f.catalog.size).toBe(0);
});
it('evicts oldest archives to the global compressed byte budget', async () => {
  const f = fixture();
  const size = EVENT_SEGMENT_BYTES;
  for (let i = 0; i < EVENT_HISTORY_ARCHIVE_BYTES / size + 1; i++) {
    const id = crypto.randomUUID();
    f.catalog.set(id, { id, bytes: size, createdAt: Date.UTC(2026, 9, 9) + i });
  }
  await append(f.history(), f.rows(1));
  expect(f.catalog.size).toBe(50);
});
it('rejects arbitrary persisted objects and limits compressed and inflated segment sizes', async () => {
  await expect(compressEventSegment('{"secret":"do not persist"}\n')).rejects.toThrow(
    'Invalid event row'
  );
  await expect(
    readEventSegment(new Blob(['x'.repeat(EVENT_SEGMENT_BYTES + 4097)]))
  ).rejects.toThrow('size');
  const f = fixture();
  const text = f.rows(2);
  expect(await readEventSegment(await compressEventSegment(text))).toBe(text);
});

it('ordinary appends do not scan archived catalog or reread active JSONL', async () => {
  const f = fixture();
  const history = f.history();
  await append(history, f.rows(1));
  f.db.readActive = async () => {
    throw new Error('Unexpected active scan');
  };
  f.db.list = async () => {
    throw new Error('Unexpected catalog scan');
  };
  expect(await append(history, f.rows(1))).toBe(true);
});
it('rejects a released mutation permit before any archive work', async () => {
  const f = fixture();
  const permit = await runWithPersistenceMutationPermit((permit) => permit);
  expect(await f.history().append(f.rows(1), permit)).toBe(false);
  expect(await f.db.verifyEmpty()).toBe(true);
});
