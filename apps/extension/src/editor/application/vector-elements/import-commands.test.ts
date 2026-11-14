// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { EditorVectorLibrary } from '../../../composition/persistence/vector-elements';
import { deferred, fixture, file, svg } from './session.test-support';

describe('vector local imports and membership', () => {
  it('deduplicates renamed SVG content and keeps valid siblings when another import is unsafe', async () => {
    const f = fixture();
    await f.session.refresh();
    await f.session.importFiles([
      file('one.svg', svg),
      file('renamed.svg', svg),
      file('unsafe.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'),
    ]);
    expect(f.definitions.size).toBe(1);
    expect(f.items.size).toBe(1);
    expect(f.session.getSnapshot().imports.map((row) => [row.accepted, row.declined])).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
    ]);
    expect([...f.definitions.values()][0]?.provenance.name).toBeNull();
    expect(f.session.getSnapshot().tab).toBe('catalog');
    f.session.dispose();
  });
  it(
    'shows collection-owned imported elements in the selected user catalog ' +
      'without independent imported membership',
    async () => {
      const f = fixture();
      await f.session.refresh();
      await f.session.importFiles([file('collected.svg', svg)]);
      const item = [...f.items.values()][0];
      if (!item) throw new Error('Missing fixture item.');
      vi.mocked(f.library.readCatalog).mockResolvedValue({
        items: [{ ...item, imported: false }],
        collections: [
          {
            key: 'collection:mine',
            kind: 'collection',
            id: 'mine',
            incarnation: 'collection',
            revision: 0,
            name: 'Mine',
            deleted: false,
          },
        ],
        members: [
          {
            key: `member:mine:${item.definitionId}`,
            kind: 'member',
            definitionId: item.definitionId,
            collectionId: 'mine',
            collectionIncarnation: 'collection',
            name: 'collected.svg',
          },
        ],
        presets: [],
      });
      await f.session.refresh();
      await f.session.setFilter('catalog', 'local:mine');
      expect(f.session.getSnapshot().tab).toBe('catalog');
      expect(f.session.getSnapshot().entries).toHaveLength(1);
      f.session.dispose();
    }
  );
});
it('imports Iconify siblings with captured membership and reports refused and oversized files', async () => {
  const f = fixture();
  const collection = { id: 'mine', incarnation: 'collection' };
  f.collections.set('mine', {
    ...collection,
    key: 'collection:mine',
    kind: 'collection',
    name: 'Mine',
    revision: 0,
    deleted: false,
  });
  vi.mocked(f.library.captureAdmission).mockResolvedValue({ expectedItem: null, collection });
  const oversized = new File([svg], 'large.svg');
  Object.defineProperty(oversized, 'size', { value: 32 * 1024 * 1024 + 1 });
  const read = vi.fn(async () => svg);
  Object.defineProperty(oversized, 'text', { value: read });
  await f.session.importFiles(
    [
      file(
        'mixed.JSON',
        JSON.stringify({
          prefix: 'test',
          width: 24,
          height: 24,
          icons: {
            valid: { body: '<path d="M0 0h10v10z"/>' },
            unsafe: { body: '<script/>' },
          },
          aliases: { missing: { parent: 'absent' } },
        })
      ),
      oversized,
      file('later.svg', svg),
    ],
    'mine'
  );
  expect(f.library.captureAdmission).toHaveBeenCalledExactlyOnceWith(undefined, 'mine');
  expect(f.session.getSnapshot().imports).toEqual([
    { name: 'mixed.JSON', accepted: 1, declined: 2 },
    { name: 'large.svg', accepted: 0, declined: 1 },
    { name: 'later.svg', accepted: 1, declined: 0 },
  ]);
  expect(read).not.toHaveBeenCalled();
  expect(f.library.importDefinition).toHaveBeenCalledTimes(2);
  expect(
    vi
      .mocked(f.library.importDefinition)
      .mock.calls.every(([, options]) => options?.collection === collection)
  ).toBe(true);
  expect(f.session.getSnapshot().tab).toBe('catalog');
  f.session.dispose();
});

it('stops unpublished import siblings when the session closes during admission', async () => {
  const f = fixture();
  const admission = deferred<Awaited<ReturnType<EditorVectorLibrary['captureAdmission']>>>();
  vi.mocked(f.library.captureAdmission).mockReturnValue(admission.promise);
  const pending = f.session.importFiles([file('closed.svg', svg)], 'mine');
  f.session.dispose();
  admission.resolve({ expectedItem: null });
  await pending;
  expect(f.library.importDefinition).not.toHaveBeenCalled();
  expect(f.session.getSnapshot().imports).toEqual([]);
});

it('creates one named destination after the first valid file and selects its user catalog', async () => {
  const f = fixture();
  await f.session.importFiles([file('one.svg', svg), file('two.svg', svg)], undefined, 'Artwork');
  expect(f.library.createCollection).toHaveBeenCalledOnce();
  const collection = [...f.collections.values()][0];
  expect(collection?.name).toBe('Artwork');
  expect(f.library.importDefinition).toHaveBeenCalledTimes(2);
  expect(f.session.getSnapshot()).toMatchObject({
    tab: 'catalog',
    collection: `local:${collection?.id}`,
  });
  expect(f.session.getSnapshot().entries).toHaveLength(1);
  expect([...f.members.values()]).toHaveLength(1);
  f.session.dispose();
});

it('does not create a collection for wholly invalid files or an empty canceled selection', async () => {
  const f = fixture();
  await f.session.importFiles([]);
  await f.session.importFiles([file('bad.svg', '<svg><script/></svg>'), file('bad.json', '{}')]);
  expect(f.library.createCollection).not.toHaveBeenCalled();
  expect(f.library.importDefinition).not.toHaveBeenCalled();
  expect(f.session.getSnapshot().imports.every((row) => row.accepted === 0)).toBe(true);
  f.session.dispose();
});

it('does not create a collection if the session closes while the selected file is read', async () => {
  const f = fixture();
  const entered = deferred<void>();
  const text = deferred<string>();
  const selected = file('delayed.svg', svg);
  Object.defineProperty(selected, 'text', {
    value: async () => {
      entered.resolve();
      return text.promise;
    },
  });
  const pending = f.session.importFiles([selected], undefined, 'Canceled');
  await entered.promise;
  f.session.dispose();
  text.resolve(svg);
  await pending;
  expect(f.library.createCollection).not.toHaveBeenCalled();
  expect(f.library.importDefinition).not.toHaveBeenCalled();
});

it('keeps the captured existing destination and refuses siblings after its deletion and recreation', async () => {
  const f = fixture();
  const original = await f.library.createCollection({ id: 'chosen', name: 'Chosen' });
  vi.mocked(f.library.createCollection).mockClear();
  const entered = deferred<void>();
  const text = deferred<string>();
  const delayed = file('late.svg', svg);
  Object.defineProperty(delayed, 'text', {
    value: async () => {
      entered.resolve();
      return text.promise;
    },
  });
  const pending = f.session.importFiles([file('first.svg', svg), delayed], 'chosen');
  await entered.promise;
  expect(f.definitions.size).toBe(1);
  f.collections.set('chosen', { ...original, incarnation: 'replacement' });
  const before = [...f.items.values()];
  text.resolve(svg.replace('h10', 'h11'));
  await pending;
  expect(f.library.captureAdmission).toHaveBeenCalledExactlyOnceWith(undefined, 'chosen');
  expect(f.library.createCollection).not.toHaveBeenCalled();
  expect([...f.items.values()]).toEqual(before);
  expect(f.session.getSnapshot().imports).toEqual([
    { name: 'first.svg', accepted: 1, declined: 0 },
    { name: 'late.svg', accepted: 0, declined: 1 },
  ]);
  f.session.dispose();
});

it('projects unassigned legacy imports as user catalogs and limits favorite catalogs to matching members', async () => {
  const { getEditorVectorUserCatalogs } = await import('./user-catalogs');
  const f = fixture();
  await f.session.importFiles([file('legacy.svg', svg)]);
  const item = [...f.items.values()][0];
  if (!item) throw new Error('Missing imported artwork.');
  const collection = [...f.collections.values()][0];
  if (!collection) throw new Error('Missing user collection.');
  const local = {
    items: [
      { ...item, favorite: true },
      { ...item, definitionId: 'legacy-svg', favorite: false },
      { ...item, definitionId: 'legacy-prefix', prefix: 'legacy', favorite: true },
    ],
    collections: [collection, { ...collection, id: 'empty', name: 'Empty' }],
    members: [...f.members.values()],
    presets: [],
  };
  const before = structuredClone(local);
  expect(getEditorVectorUserCatalogs(local).map((row) => row.value)).toEqual([
    `local:${collection.id}`,
    'local:empty',
    'imported:svg',
    'imported:prefix:legacy',
  ]);
  expect(getEditorVectorUserCatalogs(local, true).map((row) => row.value)).toEqual([
    `local:${collection.id}`,
    'imported:prefix:legacy',
  ]);
  expect(local).toEqual(before);
  f.session.dispose();
});
