import { expect, it, vi } from 'vitest';
import { fixture, attempt, mediaEnvelope } from './incoming.test-support';
import { projectSyncCatalog } from './catalog-graph';
import { indexCatalogCopies, verifyCatalogCopy } from './residency-copy';
import { SyncRemoteError } from './remote-store';

const signal = () => new AbortController().signal;
const original = () =>
  new File([new Uint8Array(3)], 'receiver-native-id-original.png', { type: 'image/png' });

it('finds a verified physical original by content without sender or receiver asset identities', async () => {
  const f = await fixture();
  const source = original();
  const wholeRead = vi.spyOn(source, 'arrayBuffer');
  const index = indexCatalogCopies(f.catalog, 'space');
  expect(f.reads).toEqual([]);
  const result = await verifyCatalogCopy(index, source, f.remote, signal());
  expect(result).toMatchObject({
    spaceId: 'space',
    operationId: 'media-op',
    objectId: 'original',
    size: source.size,
    remoteKey: f.selected.objects[0]!.remoteKey,
  });
  expect(f.reads).toEqual([result!.remoteKey]);
  expect(wholeRead).not.toHaveBeenCalled();
  expect(await source.bytes()).toEqual(new Uint8Array(3));
});

it('does not read any remote body for an unmatched local-only source', async () => {
  const f = await fixture();
  const source = new Blob(['local-only']);
  expect(
    await verifyCatalogCopy(indexCatalogCopies(f.catalog, 'space'), source, f.remote, signal())
  ).toBeNull();
  expect(f.reads).toEqual([]);
  expect(await source.text()).toBe('local-only');
});

it('hashes local bytes rather than accepting an equal-size candidate from metadata', async () => {
  const f = await fixture();
  expect(
    await verifyCatalogCopy(
      indexCatalogCopies(f.catalog, 'space'),
      new Blob(['bad']),
      f.remote,
      signal()
    )
  ).toBeNull();
  expect(f.reads).toEqual([]);
});

it.each(['bad', '', 'longer'])(
  'refuses corrupt, short or oversized remote bytes: %s',
  async (body) => {
    const f = await fixture();
    f.data.set(f.selected.objects[0]!.remoteKey, new Blob([body]));
    const source = original();
    expect(
      await verifyCatalogCopy(indexCatalogCopies(f.catalog, 'space'), source, f.remote, signal())
    ).toBeNull();
    expect(await source.bytes()).toEqual(new Uint8Array(3));
  }
);

it('tries a different immutable physical copy after a missing or corrupt alternative', async () => {
  const f = await fixture(false, true);
  const index = indexCatalogCopies(f.catalog, 'space');
  const candidates = [...index.copies.values()][0]!;
  expect(candidates).toHaveLength(2);
  f.data.delete(candidates[0]!.remoteKey);
  const result = await verifyCatalogCopy(index, original(), f.remote, signal());
  expect(result?.remoteKey).toBe(candidates[1]!.remoteKey);
  expect(f.reads).toEqual(candidates.map((candidate) => candidate.remoteKey));
  f.reads.length = 0;
  f.data.set(candidates[0]!.remoteKey, new Blob(['bad']));
  expect((await verifyCatalogCopy(index, original(), f.remote, signal()))?.remoteKey).toBe(
    candidates[1]!.remoteKey
  );
  expect(f.reads).toEqual(candidates.map((candidate) => candidate.remoteKey));
});

it.each(['temporary', 'authentication', 'access-denied', 'transport'] as const)(
  'propagates %s after one GET instead of retrying all alternatives',
  async (code) => {
    const f = await fixture(false, true);
    const failure = new SyncRemoteError(code);
    const read = vi.fn(async () => {
      throw failure;
    });
    await expect(
      verifyCatalogCopy(
        indexCatalogCopies(f.catalog, 'space'),
        original(),
        { ...f.remote, read },
        signal()
      )
    ).rejects.toBe(failure);
    expect(read).toHaveBeenCalledOnce();
  }
);

it('does not admit an object from another workspace', async () => {
  const f = await fixture();
  expect(
    await verifyCatalogCopy(indexCatalogCopies(f.catalog, 'other'), original(), f.remote, signal())
  ).toBeNull();
  expect(f.reads).toEqual([]);
});

it('does not use quarantined or incomplete logical operations as copy candidates', async () => {
  const f = await fixture();
  for (const field of ['quarantined', 'pending', 'invalidOperations'] as const) {
    const catalog = { ...f.catalog, [field]: ['media-op'] };
    expect(indexCatalogCopies(catalog, 'space').copies.size).toBe(0);
  }
  const pending = await attempt(mediaEnvelope().envelope, 'pending', 2, ['unavailable-parent']);
  const catalog = { ...f.catalog, ...projectSyncCatalog('space', [pending]) };
  expect(indexCatalogCopies(catalog, 'space').copies.size).toBe(0);
});

it('deduplicates the same immutable remote key across retained logical records', async () => {
  const f = await fixture();
  const entry = f.catalog.operations.get('media-op')!;
  entry.attempts.push(entry.attempts[0]!);
  expect([...indexCatalogCopies(f.catalog, 'space').copies.values()][0]).toHaveLength(1);
});

it('honors cancellation before verification and during a controlled remote read', async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    verifyCatalogCopy(
      indexCatalogCopies(f.catalog, 'space'),
      original(),
      f.remote,
      controller.signal
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.reads).toEqual([]);
  const active = new AbortController();
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const verification = verifyCatalogCopy(
    indexCatalogCopies(f.catalog, 'space'),
    original(),
    {
      ...f.remote,
      read: async (key, abort) => {
        entered();
        await wait;
        return f.remote.read(key, abort);
      },
    },
    active.signal
  );
  await ready;
  active.abort();
  release();
  await expect(verification).rejects.toMatchObject({ name: 'AbortError' });
});

it('retains logical publication identities independently of shared physical copy deduplication', async () => {
  const f = await fixture();
  const original = f.catalog.operations.get('media-op');
  if (!original) throw new Error('Expected fixture operation');
  f.catalog.operations.set('second-op', {
    ...original,
    operation: { ...original.operation, operationId: 'second-op', rootId: 'second-root' },
  });
  const index = indexCatalogCopies(f.catalog, 'space');
  expect([...index.copies.values()][0]).toHaveLength(1);
  expect(index.operations.get('media-op')).toMatchObject({ rootKind: 'media' });
  expect(index.operations.get('second-op')).toEqual({ rootKind: 'media', rootId: 'second-root' });
});
