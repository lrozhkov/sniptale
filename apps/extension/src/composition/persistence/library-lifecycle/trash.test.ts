import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/factories';
import { createMediaLibraryEntry, createVideoProjectEntry } from '../projects/index.test-support';
import { createLibraryLifecycle } from './contracts';
import {
  moveStoredItemsToTrash,
  restoreStoredItemsFromTrash,
  runWithTrashedStoredItem,
  runWithStoredItemLifecycle,
  StaleTrashItemError,
} from './trash';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.mutate,
}));

const media = createMediaLibraryEntry({
  workspaceRevision: 0,
  lifecycle: createLibraryLifecycle('temporary', 1),
});
const video = createVideoProjectEntry({}, { lifecycle: createLibraryLifecycle('library', 1) });
const scenario = {
  id: 'scenario-1',
  project: createGuideProject('Guide', 'scenario-1', 1),
  createdAt: 1,
  updatedAt: 1,
  workspaceRevision: 0,
  lifecycle: createLibraryLifecycle('temporary', 1),
};
const targets = [
  { kind: 'media', id: media.id },
  { kind: 'video-project', id: video.id },
  { kind: 'scenario-project', id: scenario.id },
] as const;
let rows: Map<string, Map<string, unknown>>;
let transaction: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('navigator', {});
  rows = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[media.id, media]])],
    ['video_projects', new Map([[video.id, video]])],
    ['scenario_projects', new Map([[scenario.id, scenario]])],
    [
      'scenario_exports',
      new Map([
        [
          'export-1',
          {
            id: 'export-1',
            projectId: 'scenario-1',
            format: 'html',
            filename: 'guide.html',
            createdAt: 1,
            size: 42,
          },
        ],
      ]),
    ],
    ['asset_owners', new Map([['retained', { assetId: 'unchanged' }]])],
  ]);
  transaction = vi.fn(() => {
    const staged = new Map([...rows].map(([name, entries]) => [name, new Map(entries)]));
    let aborted = false;
    return {
      abort() {
        aborted = true;
      },
      get done() {
        return Promise.resolve().then(() => {
          if (aborted) throw new Error('Aborted');
          rows = staged;
        });
      },
      objectStore(name: string) {
        return {
          get: async (id: string) => staged.get(name)?.get(id),
          put: async (entry: { id: string }) => staged.get(name)?.set(entry.id, entry),
        };
      },
    };
  });
  mocks.mutate.mockImplementation(async (operation) =>
    operation({
      transaction,
      get: async (name: string, id: string) => rows.get(name)?.get(id),
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

it('retains each aggregate graph and original destination through duplicate trash and restore', async () => {
  await moveStoredItemsToTrash(targets, 100);
  await moveStoredItemsToTrash(targets, 200);
  expect(rows.get('media_library')?.get(media.id)).toEqual({
    ...media,
    lifecycle: { ...media.lifecycle, trashedAt: 100 },
  });
  expect(rows.get('video_projects')?.get(video.id)).toEqual({
    ...video,
    lifecycle: { ...video.lifecycle, trashedAt: 100 },
  });
  expect(rows.get('scenario_projects')?.get(scenario.id)).toEqual({
    ...scenario,
    lifecycle: { ...scenario.lifecycle, trashedAt: 100 },
  });
  expect(rows.get('asset_owners')?.get('retained')).toEqual({ assetId: 'unchanged' });
  await restoreStoredItemsFromTrash(targets, 300);
  await restoreStoredItemsFromTrash(targets, 400);
  expect(rows.get('media_library')?.get(media.id)).toEqual({
    ...media,
    lifecycle: { ...media.lifecycle, updatedAt: 300 },
  });
  expect(rows.get('video_projects')?.get(video.id)).toEqual({
    ...video,
    lifecycle: { ...video.lifecycle, updatedAt: 300 },
  });
  expect(rows.get('scenario_projects')?.get(scenario.id)).toEqual({
    ...scenario,
    lifecycle: { ...scenario.lifecycle, updatedAt: 300 },
  });
});

it('aborts the entire selection if a selected aggregate disappears', async () => {
  await expect(
    moveStoredItemsToTrash([targets[0], { kind: 'media', id: 'missing' }], 100)
  ).rejects.toBeInstanceOf(StaleTrashItemError);
  expect(rows.get('media_library')?.get(media.id)).toEqual(media);
});

it('refuses stale permanent deletion after restore and after another trash admission', async () => {
  const deletion = vi.fn();
  await moveStoredItemsToTrash([targets[0]], 100);
  await restoreStoredItemsFromTrash([targets[0]], 200);
  await expect(runWithTrashedStoredItem(targets[0], 100, deletion)).rejects.toBeInstanceOf(
    StaleTrashItemError
  );
  await moveStoredItemsToTrash([targets[0]], 300);
  await expect(runWithTrashedStoredItem(targets[0], 100, deletion)).rejects.toBeInstanceOf(
    StaleTrashItemError
  );
  expect(deletion).not.toHaveBeenCalled();
});

it('holds restoration until the complete permanent deletion workflow finishes', async () => {
  await moveStoredItemsToTrash([targets[0]], 100);
  const gate = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const deletion = runWithTrashedStoredItem(targets[0], 100, async () => {
    entered.resolve();
    await gate.promise;
    rows.get('media_library')?.delete(media.id);
  });
  await entered.promise;
  const restoration = restoreStoredItemsFromTrash([targets[0]], 200);
  const result = expect(restoration).rejects.toBeInstanceOf(StaleTrashItemError);
  expect(rows.get('media_library')?.get(media.id)).toMatchObject({ lifecycle: { trashedAt: 100 } });
  gate.resolve();
  await deletion;
  await result;
});

it('releases the guard after failed deletion so the retained item can be restored', async () => {
  await moveStoredItemsToTrash([targets[0]], 100);
  await expect(
    runWithTrashedStoredItem(targets[0], 100, async () => {
      throw new Error('blocked');
    })
  ).rejects.toThrow('blocked');
  await restoreStoredItemsFromTrash([targets[0]], 200);
  expect(rows.get('media_library')?.get(media.id)).toMatchObject({ lifecycle: { updatedAt: 200 } });
});

it('distinguishes restored and retrash admissions even within the same clock millisecond', async () => {
  const deletion = vi.fn();
  await moveStoredItemsToTrash([targets[0]], 100);
  await restoreStoredItemsFromTrash([targets[0]], 100);
  await moveStoredItemsToTrash([targets[0]], 100);
  await expect(runWithTrashedStoredItem(targets[0], 100, deletion)).rejects.toBeInstanceOf(
    StaleTrashItemError
  );
  expect(rows.get('media_library')?.get(media.id)).toMatchObject({ lifecycle: { trashedAt: 101 } });
  expect(deletion).not.toHaveBeenCalled();
});

it('fails closed if cross-page locks are unavailable in the extension', async () => {
  vi.stubGlobal('chrome', {});
  await expect(moveStoredItemsToTrash([targets[0]], 100)).rejects.toThrow(
    'coordination is unavailable'
  );
  expect(transaction).not.toHaveBeenCalled();
});

it('admits active permanent deletion without changing its lifecycle or retained graph', async () => {
  const deletion = vi.fn(async () => 'deleted');
  for (const target of targets) {
    await expect(runWithStoredItemLifecycle(target, { updatedAt: 1 }, deletion)).resolves.toBe(
      'deleted'
    );
  }
  expect(deletion).toHaveBeenCalledTimes(3);
  expect(transaction).not.toHaveBeenCalled();
  expect(rows.get('media_library')?.get(media.id)).toEqual(media);
});

it('invalidates an active confirmation after move and restore even if active again', async () => {
  const deletion = vi.fn();
  await moveStoredItemsToTrash([targets[0]], 100);
  await expect(
    runWithStoredItemLifecycle(targets[0], { updatedAt: 1 }, deletion)
  ).rejects.toBeInstanceOf(StaleTrashItemError);
  await restoreStoredItemsFromTrash([targets[0]], 200);
  await expect(
    runWithStoredItemLifecycle(targets[0], { updatedAt: 1 }, deletion)
  ).rejects.toBeInstanceOf(StaleTrashItemError);
  expect(deletion).not.toHaveBeenCalled();
});

it('rejects missing roots and malformed lifecycle snapshots before permanent deletion', async () => {
  const deletion = vi.fn();
  await expect(
    runWithStoredItemLifecycle({ kind: 'media', id: 'missing' }, { updatedAt: 1 }, deletion)
  ).rejects.toBeInstanceOf(StaleTrashItemError);
  await expect(
    runWithStoredItemLifecycle(targets[0], { updatedAt: Number.NaN }, deletion)
  ).rejects.toBeInstanceOf(StaleTrashItemError);
  expect(deletion).not.toHaveBeenCalled();
});

it('admits legacy active roots with the same metadata revision fallback as Gallery', async () => {
  const { lifecycle: _lifecycle, ...legacy } = media;
  rows.get('media_library')?.set(media.id, legacy);
  const deletion = vi.fn(async () => undefined);
  await runWithStoredItemLifecycle(targets[0], { updatedAt: media.updatedAt }, deletion);
  expect(deletion).toHaveBeenCalledOnce();
});

it('holds lifecycle mutations until active permanent deletion finishes', async () => {
  const gate = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const deletion = runWithStoredItemLifecycle(targets[0], { updatedAt: 1 }, async () => {
    entered.resolve();
    await gate.promise;
    rows.get('media_library')?.delete(media.id);
  });
  await entered.promise;
  const move = moveStoredItemsToTrash([targets[0]], 100);
  const result = expect(move).rejects.toBeInstanceOf(StaleTrashItemError);
  expect(transaction).not.toHaveBeenCalled();
  gate.resolve();
  await deletion;
  await result;
});

it('moves and restores only an export catalogue marker, leaving its parent and siblings untouched', async () => {
  const parent = rows.get('scenario_projects')?.get(scenario.id);
  const source = rows.get('scenario_exports')?.get('export-1');
  rows.get('scenario_exports')?.set('sibling', { ...(source as object), id: 'sibling' });
  const sibling = rows.get('scenario_exports')?.get('sibling');
  const target = { kind: 'scenario-export' as const, id: 'export-1' };
  await moveStoredItemsToTrash([target], 100);
  expect(rows.get('scenario_exports')?.get('export-1')).toEqual({
    ...(source as object),
    trashState: { updatedAt: 1, trashedAt: 100 },
  });
  await restoreStoredItemsFromTrash([target], 200);
  await expect(
    runWithStoredItemLifecycle(target, { updatedAt: 1, trashedAt: 100 }, vi.fn())
  ).rejects.toBeInstanceOf(StaleTrashItemError);
  expect(rows.get('scenario_exports')?.get('export-1')).toEqual({
    ...(source as object),
    trashState: { updatedAt: 200 },
  });
  expect(rows.get('scenario_projects')?.get(scenario.id)).toEqual(parent);
  expect(rows.get('scenario_exports')?.get('sibling')).toEqual(sibling);
});
