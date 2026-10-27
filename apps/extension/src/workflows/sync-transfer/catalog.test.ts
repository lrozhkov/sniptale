import { expect, it } from 'vitest';
import { scanSyncCatalog, SyncCatalogError } from './catalog';
import { createSyncAttempt, hashSyncText } from './wire-record';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';

const id = (number: number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
async function fixture(
  operationId = 'operation',
  parents: string[] = [],
  attempt = 1,
  spaceId = 'space'
) {
  const text = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId,
    operationId,
    rootKind: 'media',
    rootId: 'root',
    kind: 'delete',
    parents,
    dependencies: [],
    envelope: null,
    objects: [],
  });
  return createSyncAttempt(text, id(attempt));
}
function memory(pages: { key: string; size: number }[][], data: Map<string, Blob>) {
  const reads: string[] = [];
  const prefixes: string[] = [];
  const remote: SyncRemoteStore = {
    list: async (prefix, options) => {
      prefixes.push(prefix);
      const index = options.cursor ? Number(options.cursor) : 0;
      return {
        objects: pages[index] ?? [],
        prefixes: [],
        nextCursor: index + 1 < pages.length ? String(index + 1) : null,
      };
    },
    read: async (key) => {
      reads.push(key);
      const body = data.get(key);
      if (!body) throw new SyncRemoteError('missing');
      return body.stream();
    },
    write: async () => {
      throw new Error('Discovery must not write.');
    },
  };
  return { remote, reads, prefixes };
}
it('scans shuffled pages and identical attempts without reading any original object prefix', async () => {
  const first = await fixture();
  const duplicate = await fixture('operation', [], 2);
  const child = await fixture('child', ['operation'], 3);
  const data = new Map(
    [first, duplicate, child].map((item) => [item.recordKey, new Blob([item.recordText])])
  );
  const descriptor = (item: typeof first) => ({
    key: item.recordKey,
    size: data.get(item.recordKey)!.size,
  });
  const io = memory(
    [
      [descriptor(child), descriptor(duplicate)],
      [descriptor(first), descriptor(child)],
    ],
    data
  );
  const catalog = await scanSyncCatalog(io.remote, 'space', new AbortController().signal);
  expect(catalog.operations.size).toBe(2);
  expect(catalog.operations.get('operation')?.attempts).toHaveLength(2);
  expect(catalog.pending).toEqual([]);
  expect(catalog.invalid).toEqual([]);
  expect(io.reads).toHaveLength(3);
  expect(io.prefixes).toEqual(Array(2).fill(`.sniptale/${hashSyncText('space')}/records/`));
  expect(io.reads.every((key) => key.startsWith(io.prefixes[0]!))).toBe(true);
});
it('does not GET an out-of-prefix key or an oversized declared manifest', async () => {
  const first = await fixture();
  const io = memory(
    [
      [
        { key: 'Files/private.png', size: 1 },
        { key: first.recordKey, size: 4 * 1024 * 1024 + 1 },
      ],
    ],
    new Map()
  );
  const result = await scanSyncCatalog(io.remote, 'space', new AbortController().signal);
  expect(result.invalid).toHaveLength(2);
  expect(io.reads).toEqual([]);
});
it('rejects corrupt bytes, non-UTF8 data and a manifest moved from another space', async () => {
  const first = await fixture();
  const foreign = await fixture('foreign', [], 2, 'other-space');
  const secondKey = foreign.recordKey.replace(hashSyncText('other-space'), hashSyncText('space'));
  const bodies = new Map([
    [first.recordKey, new Blob([new Uint8Array([0xff])])],
    [secondKey, new Blob([foreign.recordText])],
  ]);
  const io = memory([[...bodies].map(([key, blob]) => ({ key, size: blob.size }))], bodies);
  const result = await scanSyncCatalog(io.remote, 'space', new AbortController().signal);
  expect(result.invalid).toHaveLength(2);
  expect(result.operations.size).toBe(0);
});
it('checks exact physical digest and advertised size before projection', async () => {
  const first = await fixture();
  for (const [body, size] of [
    [first.recordText + ' ', new Blob([first.recordText + ' ']).size],
    [first.recordText, 1],
  ] as const) {
    const io = memory(
      [[{ key: first.recordKey, size }]],
      new Map([[first.recordKey, new Blob([body])]])
    );
    expect(
      (await scanSyncCatalog(io.remote, 'space', new AbortController().signal)).invalid
    ).toHaveLength(1);
  }
});
it('refuses a repeated cursor instead of exposing a partial graph', async () => {
  const io = memory([], new Map());
  io.remote.list = async () => ({ objects: [], prefixes: [], nextCursor: 'same' });
  await expect(
    scanSyncCatalog(io.remote, 'space', new AbortController().signal)
  ).rejects.toMatchObject({ code: 'pagination-cycle' });
});
it('propagates temporary metadata refusal and cancellation rather than treating them as an empty catalog', async () => {
  const first = await fixture();
  const io = memory([[{ key: first.recordKey, size: 1 }]], new Map());
  io.remote.read = async () => {
    throw new SyncRemoteError('temporary', 503);
  };
  await expect(
    scanSyncCatalog(io.remote, 'space', new AbortController().signal)
  ).rejects.toMatchObject({ code: 'temporary' });
  const controller = new AbortController();
  controller.abort();
  await expect(scanSyncCatalog(io.remote, 'space', controller.signal)).rejects.toThrow();
});
it('admits a missing initial metadata namespace as an empty catalog but preserves later read failures', async () => {
  const io = memory([], new Map());
  io.remote.list = async () => {
    throw new SyncRemoteError('missing');
  };
  expect(
    (await scanSyncCatalog(io.remote, 'space', new AbortController().signal)).operations.size
  ).toBe(0);
  const first = await fixture();
  const missing = memory([[{ key: first.recordKey, size: 1 }]], new Map());
  await expect(
    scanSyncCatalog(missing.remote, 'space', new AbortController().signal)
  ).rejects.toMatchObject({ code: 'missing' });
});
it('refuses the manifest count budget before returning partial state', async () => {
  const io = memory(
    [Array.from({ length: 10001 }, (_, index) => ({ key: `bad-${index}`, size: 0 }))],
    new Map()
  );
  const failure = scanSyncCatalog(io.remote, 'space', new AbortController().signal);
  await expect(failure).rejects.toBeInstanceOf(SyncCatalogError);
  await expect(failure).rejects.toMatchObject({ code: 'metadata-limit' });
  expect(io.reads).toEqual([]);
});
