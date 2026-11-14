// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { isEditorVectorDefinition } from '../../../features/editor/document/vector-element';
import { EditorVectorCatalogError } from '../../../features/editor/vector-catalog';
import { createEditorVectorLibrarySession, type EditorVectorCatalogPort } from './session';
import { deferred, fixture } from './session.test-support';

function persistedDownloads(f: ReturnType<typeof fixture>, names: string[]) {
  const collections = new Map<
    string,
    import('../../../composition/persistence/vector-elements/contracts').EditorVectorCollection
  >();
  const rows = new Map<
    string,
    import('../../../composition/persistence/vector-elements/contracts').EditorVectorDownload
  >();
  let sequence = 0;
  vi.mocked(f.library.readCatalog).mockImplementation(async () => ({
    items: [...f.items.values()],
    collections: [...collections.values()],
    members: [],
    presets: [],
  }));
  vi.mocked(f.library.createCollection).mockImplementation(async (input) => {
    const row = {
      ...input,
      key: `collection:${input.id}`,
      kind: 'collection' as const,
      incarnation: `collection-${++sequence}`,
      revision: 1,
      deleted: false,
    };
    const { isEditorVectorCollection } =
      await import('../../../composition/persistence/vector-elements/contracts');
    if (!isEditorVectorCollection(row)) throw new Error('Invalid vector collection.');
    if (collections.has(row.id)) throw new Error('Vector collection identity already exists.');
    collections.set(row.id, row);
    return row;
  });
  type Port = Parameters<typeof createEditorVectorLibrarySession>[0]['downloads'];
  vi.mocked(f.dependencies.downloads.begin).mockImplementation(
    async (input: Parameters<Port['begin']>[0]) => {
      const previous = rows.get(input.collection.id);
      const row = {
        key: `download:${input.collection.id}`,
        kind: 'download' as const,
        collectionId: input.collection.id,
        collectionIncarnation: input.collection.incarnation,
        incarnation: `download-${++sequence}`,
        generation: (previous?.generation ?? 0) + 1,
        source: input.source ? { ...input.source } : null,
        manifest: [...input.manifest],
        accepted: previous?.accepted ?? {},
        status: input.manifest.every((name) => Object.hasOwn(previous?.accepted ?? {}, name))
          ? ('ready' as const)
          : ('downloading' as const),
        error: null,
        ...('prefix' in input ? { prefix: input.prefix } : {}),
      };
      const { isEditorVectorDownload } =
        await import('../../../composition/persistence/vector-elements/contracts');
      if (!isEditorVectorDownload(row)) throw new Error('Invalid vector download.');
      rows.set(row.collectionId, row);
      return {
        collection: input.collection,
        source: row.source,
        incarnation: row.incarnation,
        generation: row.generation,
      };
    }
  );
  vi.mocked(f.dependencies.downloads.inspect).mockImplementation(
    async (id: string) => rows.get(id) ?? null
  );
  vi.mocked(f.dependencies.downloads.acceptBatch).mockImplementation(
    async (
      token: Parameters<Port['acceptBatch']>[0],
      entries: Parameters<Port['acceptBatch']>[1]
    ) => {
      const row = rows.get(token.collection.id);
      if (!row || row.incarnation !== token.incarnation) throw new Error('Superseded download.');
      const accepted = { ...row.accepted };
      for (const entry of entries) {
        if (!isEditorVectorDefinition(entry.definition))
          throw new Error('Invalid prepared definition.');
        accepted[entry.name] = entry.definition.id;
      }
      const next = {
        ...row,
        accepted,
        status: row.manifest.every((name) => Object.hasOwn(accepted, name))
          ? ('ready' as const)
          : ('partial' as const),
      };
      rows.set(next.collectionId, next);
      return { accepted: entries.map((entry) => entry.name), rejected: [], state: next };
    }
  );
  f.catalog.collection = vi.fn(async (prefix) => ({
    source: f.source,
    data: { prefix, uncategorized: names, info: { name: 'Test collection' } },
  }));
  f.catalog.assets = vi.fn<EditorVectorCatalogPort['assets']>(async (prefix, batch) => ({
    source: f.source,
    data: {
      prefix,
      width: 24,
      height: 24,
      icons: Object.fromEntries(batch.map((name) => [name, { body: '<path d="M0 0h10v10z"/>' }])),
    },
  }));
  return { collections, rows };
}

it('ignores obsolete download progress after a newer job finishes while its prior commit is pending', async () => {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  persistedDownloads(f, ['new']);
  const firstCommitted = deferred<void>();
  const releaseFirst = deferred<void>();
  const port: Parameters<typeof createEditorVectorLibrarySession>[0]['downloads'] =
    f.dependencies.downloads;
  const acceptBatch = vi.mocked(port.acceptBatch).getMockImplementation();
  if (!acceptBatch) throw new Error('Missing controlled download publication.');
  let commits = 0;
  vi.mocked(port.acceptBatch).mockImplementation(async (token, entries) => {
    const result = await acceptBatch(token, entries);
    if (++commits === 1) {
      firstCommitted.resolve();
      await releaseFirst.promise;
    }
    return result;
  });
  await f.session.refresh();
  const prior = f.session.downloadCollection('test');
  await firstCommitted.promise;
  await f.session.downloadCollection('replacement');
  expect(f.session.getSnapshot().download).toMatchObject({
    prefix: 'replacement',
    status: 'ready',
  });
  releaseFirst.resolve();
  await prior;
  expect(f.session.getSnapshot().download).toMatchObject({
    prefix: 'replacement',
    status: 'ready',
  });
  f.session.dispose();
});

it('downloads through the real validator and keeps completed collections ready', async () => {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  const stored = persistedDownloads(f, ['new']);
  await f.session.refresh();
  await f.session.downloadCollection('test');
  expect(f.session.getSnapshot().error).toBe(false);
  expect(f.session.getSnapshot().download).toMatchObject({
    prefix: 'test',
    status: 'ready',
    accepted: 1,
    total: 1,
  });
  expect([...stored.rows.values()][0]).toMatchObject({ prefix: 'test', status: 'ready' });
  expect([...stored.collections.keys()][0]).toMatch(/^[a-zA-Z0-9_-]{1,128}$/u);
  await f.session.downloadCollection('test');
  expect(f.library.createCollection).toHaveBeenCalledOnce();
  expect(f.session.getSnapshot().download?.status).toBe('ready');
  f.session.dispose();
});

it('retries a failed download using its authoritative existing collection and only the missing chunk', async () => {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  const names = Array.from({ length: 33 }, (_, index) => `icon${index}`);
  const stored = persistedDownloads(f, names);
  const entered = deferred<void>(),
    release = deferred<void>();
  const normalAssets = f.catalog.assets;
  let calls = 0;
  f.catalog.assets = vi.fn(async (prefix, batch, signal) => {
    if (++calls === 2) {
      entered.resolve();
      await release.promise;
      throw new EditorVectorCatalogError('network-failed');
    }
    return normalAssets(prefix, batch, signal);
  });
  await f.session.refresh();
  const pending = f.session.downloadCollection('test');
  await Promise.race([
    entered.promise,
    pending.then(() => {
      throw new Error('Download ended before the second batch reached the provider.');
    }),
  ]);
  expect(Object.keys([...stored.rows.values()][0]?.accepted ?? {})).toHaveLength(32);
  release.resolve();
  await pending;
  await f.session.downloadCollection('test');
  expect(f.library.createCollection).toHaveBeenCalledOnce();
  expect(vi.mocked(f.catalog.assets).mock.calls.at(-1)?.[1]).toEqual(['icon32']);
  expect(f.session.getSnapshot().download).toMatchObject({
    accepted: 33,
    total: 33,
    status: 'ready',
  });
  f.session.dispose();
});

it('restores an explicit download prefix and resumes persisted partial work after a session restart', async () => {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  const names = Array.from({ length: 33 }, (_, index) => `icon${index}`);
  const stored = persistedDownloads(f, names);
  const normalAssets = f.catalog.assets;
  let calls = 0;
  f.catalog.assets = vi.fn(async (prefix, batch, signal) => {
    if (++calls === 2) throw new EditorVectorCatalogError('network-failed');
    return normalAssets(prefix, batch, signal);
  });
  await f.session.refresh();
  await f.session.downloadCollection('test');
  expect(Object.keys([...stored.rows.values()][0]?.accepted ?? {})).toHaveLength(32);
  f.session.dispose();
  const restarted = createEditorVectorLibrarySession(f.dependencies);
  await restarted.refresh();
  const row = restarted.getSnapshot().downloads[0];
  expect(row).toMatchObject({ prefix: 'test', status: 'partial' });
  if (!row || !('prefix' in row) || typeof row.prefix !== 'string')
    throw new Error('Missing persisted provider prefix.');
  await restarted.downloadCollection(row.prefix);
  expect(f.library.createCollection).toHaveBeenCalledOnce();
  expect(restarted.getSnapshot().download).toMatchObject({
    accepted: 33,
    total: 33,
    status: 'ready',
  });
  restarted.dispose();
});

it('keeps source and prefix collection identities distinct without changing earlier accepted definitions', async () => {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  const stored = persistedDownloads(f, ['new']);
  await f.session.refresh();
  await f.session.downloadCollection('test');
  const original = structuredClone([...stored.rows.values()][0]);
  await f.session.downloadCollection('other-prefix');
  f.setSettings({ baseUrl: 'https://replacement.example/chosen/', sourceGeneration: 1 });
  f.source.sourceId = 'https://replacement.example/chosen/';
  f.source.generation = 1;
  await f.session.refresh();
  await f.session.downloadCollection('test');
  expect(stored.collections.size).toBe(3);
  expect(stored.rows.size).toBe(3);
  if (!original) throw new Error('Missing accepted original collection.');
  expect(stored.rows.get(original.collectionId)).toEqual(original);
  const replacement = [...stored.rows.values()].find(
    (row) => row.source?.sourceId === f.source.sourceId
  );
  expect(replacement?.accepted['new']).not.toBe(original.accepted['new']);
  expect([...stored.collections.keys()].every((id) => /^[a-zA-Z0-9_-]{1,128}$/u.test(id))).toBe(
    true
  );
  f.session.dispose();
});

it('reports opening and first batch failures without losing the ability to retry', async () => {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  persistedDownloads(f, ['new']);
  await f.session.refresh();
  await f.session.downloadCollection('invalid prefix');
  expect(f.session.getSnapshot().error).toBe(true);
  expect(f.dependencies.downloads.begin).not.toHaveBeenCalled();
  const assets = f.catalog.assets;
  f.catalog.assets = vi
    .fn()
    .mockRejectedValueOnce(new EditorVectorCatalogError('network-failed'))
    .mockImplementation(assets);
  await f.session.downloadCollection('test');
  expect(f.session.getSnapshot().download).toMatchObject({ accepted: 0, status: 'error' });
  expect(f.session.getSnapshot().errorCode).toBe('network-failed');
  await f.session.downloadCollection('test');
  expect(f.session.getSnapshot().download).toMatchObject({ accepted: 1, status: 'ready' });
  f.session.dispose();
});

it('cancels a pending batch with its durable token even if cancellation storage fails', async () => {
  const f = fixture();
  await f.session.cancelDownload();
  expect(f.dependencies.downloads.cancel).not.toHaveBeenCalled();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  persistedDownloads(f, ['new']);
  const entered = deferred<void>(),
    release = deferred<void>();
  const assets = f.catalog.assets;
  f.catalog.assets = vi.fn(async (prefix, names, signal) => {
    entered.resolve();
    await release.promise;
    return assets(prefix, names, signal);
  });
  f.dependencies.downloads.cancel.mockRejectedValue(new Error('Unavailable storage.'));
  await f.session.refresh();
  const pending = f.session.downloadCollection('test');
  await entered.promise;
  await f.session.cancelDownload();
  expect(f.dependencies.downloads.cancel).toHaveBeenCalledExactlyOnceWith(
    await f.dependencies.downloads.begin.mock.results[0]?.value
  );
  expect(f.session.getSnapshot().download).toMatchObject({ accepted: 0, status: 'error' });
  release.resolve();
  await pending;
  expect(f.dependencies.downloads.acceptBatch).not.toHaveBeenCalled();
  expect(f.session.getSnapshot().error).toBe(false);
  f.session.dispose();
});

it('retains valid download siblings when one requested definition is refused', async () => {
  const f = fixture();
  f.setSettings({ networkEnabled: true, disclosureAccepted: true });
  persistedDownloads(f, ['new', 'unsafe']);
  f.catalog.assets = vi.fn(async () => ({
    source: f.source,
    data: {
      prefix: 'test',
      width: 24,
      height: 24,
      icons: { new: { body: '<path d="M0 0h10v10z"/>' }, unsafe: { body: '<script/>' } },
    },
  }));
  await f.session.refresh();
  await f.session.downloadCollection('test');
  expect(f.dependencies.downloads.fail).toHaveBeenCalledWith(
    await f.dependencies.downloads.begin.mock.results[0]?.value,
    'definition-refused'
  );
  expect(f.session.getSnapshot().download).toMatchObject({
    accepted: 1,
    total: 2,
    status: 'partial',
  });
  f.session.dispose();
});
