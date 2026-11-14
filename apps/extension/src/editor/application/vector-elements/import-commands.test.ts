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
    expect(f.session.getSnapshot().tab).toBe('mine');
    f.session.dispose();
  });
  it('shows collection-owned imported elements in My view without independent imported membership', async () => {
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
    expect(f.session.getSnapshot().tab).toBe('mine');
    expect(f.session.getSnapshot().entries).toHaveLength(1);
    f.session.dispose();
  });
});
it('imports Iconify siblings with captured membership and reports refused and oversized files', async () => {
  const f = fixture();
  const collection = { id: 'mine', incarnation: 'collection' };
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
  expect(f.session.getSnapshot().tab).toBe('mine');
  f.session.dispose();
});

it('stops unpublished import siblings when the session closes during admission', async () => {
  const f = fixture();
  const admission = deferred<Awaited<ReturnType<EditorVectorLibrary['captureAdmission']>>>();
  vi.mocked(f.library.captureAdmission).mockReturnValue(admission.promise);
  const pending = f.session.importFiles([file('closed.svg', svg)]);
  f.session.dispose();
  admission.resolve({ expectedItem: null });
  await pending;
  expect(f.library.importDefinition).not.toHaveBeenCalled();
  expect(f.session.getSnapshot().imports).toEqual([]);
});
