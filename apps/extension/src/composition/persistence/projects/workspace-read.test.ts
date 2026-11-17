import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntry } from './index.test-support';
import {
  createVideoProjectHistoryChange,
  applyVideoProjectHistoryChangeValues,
} from '../../../features/video/project/history-change';
import { collectVideoProjectHistorySources } from '../../../features/video/project/history-capture';
import { preparePersistedVideoProjectHistory } from './history-codec';
import { getVideoProject, getVideoProjectWorkspace, listVideoProjects } from './index';
import {
  VIDEO_PROJECT_HISTORY_OWNER_KIND,
  videoProjectHistoryAssetBindings,
} from './history-contracts';
import type { AssetRef } from '../assets/contracts';

const io = vi.hoisted(() => ({
  db: null as IDBPDatabase | null,
  files: new Map<string, Blob>(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => {
    if (!io.db) throw new Error('Test database is closed');
    return io.db;
  },
}));
vi.mock('../assets', async (original) => ({
  ...(await original<typeof import('../assets')>()),
  readAssetFile: io.read,
  writeBlobToAsset: io.write,
  collectPreparedAssetCleanupFailures: async (ids: readonly string[]) => {
    for (const id of ids) io.files.delete(id);
    return [];
  },
}));

let db: IDBPDatabase;
let name: string;
beforeEach(async () => {
  name = `montage-workspace-read-${crypto.randomUUID()}`;
  db = await openDB(name, 1, {
    upgrade(database) {
      database.createObjectStore('video_projects', { keyPath: 'id' });
      database.createObjectStore('asset_refs', { keyPath: 'assetId' });
      database.createObjectStore('asset_owners', {
        keyPath: ['ownerKind', 'ownerId', 'role'],
      });
    },
  });
  io.db = db;
  io.files.clear();
  io.write.mockReset().mockImplementation(async (blob: Blob) => {
    const assetId = crypto.randomUUID();
    io.files.set(assetId, blob);
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type,
        size: blob.size,
        sha256: null,
      },
    };
  });
  io.read.mockReset().mockImplementation(async (ref: AssetRef, filename: string) => {
    const blob = io.files.get(ref.assetId);
    if (!blob) throw new Error('Missing test file');
    return new File([blob], filename, { type: blob.type });
  });
});
afterEach(async () => {
  io.db = null;
  db.close();
  await deleteDB(name);
});

async function seed() {
  const entry = createVideoProjectEntry({ name: 'Current' }, { workspaceRevision: 7 });
  const before = { ...entry.project, name: 'Before' };
  const after = { ...entry.project, name: 'After' };
  const value = (project: typeof before) => {
    const value = JSON.stringify(createVideoProjectHistoryChange(project, entry.project));
    return {
      value,
      bytes: new TextEncoder().encode(value).byteLength,
      sources: collectVideoProjectHistorySources(project),
    };
  };
  const prepared = await preparePersistedVideoProjectHistory({
    version: 1,
    epoch: 'epoch',
    past: [value(before)],
    future: [value(after)],
  });
  const tx = db.transaction(['video_projects', 'asset_refs', 'asset_owners'], 'readwrite');
  await tx.objectStore('video_projects').put({ ...entry, history: prepared.history });
  for (const ref of prepared.refs) await tx.objectStore('asset_refs').put(ref);
  for (const binding of videoProjectHistoryAssetBindings(prepared.history))
    await tx.objectStore('asset_owners').put({
      ...binding,
      ownerKind: VIDEO_PROJECT_HISTORY_OWNER_KIND,
      ownerId: entry.id,
    });
  await tx.done;
  io.write.mockClear();
  return { entry, prepared, before, after };
}

it('reads both history directions and the observed native revision from one workspace snapshot', async () => {
  const { entry, before, after } = await seed();
  const loaded = await getVideoProjectWorkspace(entry.id);
  expect(loaded.status).toBe('ready');
  if (loaded.status !== 'ready' || loaded.history.status !== 'ready')
    throw new Error('Missing loaded history');
  expect(loaded.workspaceRevision).toBe(7);
  expect(
    applyVideoProjectHistoryChangeValues(loaded.project, loaded.history.value.past[0]!.change)
  ).toEqual(before);
  expect(
    applyVideoProjectHistoryChangeValues(loaded.project, loaded.history.value.future[0]!.change)
  ).toEqual(after);
  expect(io.read).toHaveBeenCalledTimes(2);
  expect(io.write).not.toHaveBeenCalled();
});

it('keeps the observed project and reference snapshot together when another save wins during file IO', async () => {
  const { entry, prepared } = await seed();
  const read = io.read.getMockImplementation()!;
  io.read.mockImplementationOnce(async (ref: AssetRef, filename: string) => {
    const tx = db.transaction(['video_projects', 'asset_refs'], 'readwrite');
    await tx.objectStore('video_projects').put({
      ...entry,
      workspaceRevision: 8,
      project: { ...entry.project, name: 'Newer' },
    });
    for (const ref of prepared.refs) await tx.objectStore('asset_refs').delete(ref.assetId);
    await tx.done;
    return read(ref, filename);
  });
  expect(await getVideoProjectWorkspace(entry.id)).toMatchObject({
    status: 'ready',
    workspaceRevision: 7,
    project: { name: 'Current' },
    history: { status: 'ready' },
  });
  expect(await db.get('video_projects', entry.id)).toMatchObject({
    workspaceRevision: 8,
    project: { name: 'Newer' },
  });
});

it.each(['header', 'owner', 'binding', 'ref', 'bytes'] as const)(
  'preserves independently valid current content when history %s is unavailable',
  async (failure) => {
    const { entry, prepared } = await seed();
    if (failure === 'header')
      await db.put('video_projects', { ...entry, history: { version: 99 } });
    if (failure === 'owner') await db.clear('asset_owners');
    if (failure === 'binding') {
      const binding = videoProjectHistoryAssetBindings(prepared.history)[0]!;
      await db.put('asset_owners', {
        ...binding,
        assetId: 'other-resource',
        ownerKind: VIDEO_PROJECT_HISTORY_OWNER_KIND,
        ownerId: entry.id,
      });
    }
    if (failure === 'ref') await db.clear('asset_refs');
    if (failure === 'bytes') io.files.clear();
    const stored = await db.get('video_projects', entry.id);
    const refs = await db.getAll('asset_refs');
    const owners = await db.getAll('asset_owners');
    expect(await getVideoProjectWorkspace(entry.id)).toMatchObject({
      status: 'ready',
      project: entry.project,
      workspaceRevision: 7,
      history: { status: 'unavailable' },
    });
    expect(await db.get('video_projects', entry.id)).toEqual(stored);
    expect(await db.getAll('asset_refs')).toEqual(refs);
    expect(await db.getAll('asset_owners')).toEqual(owners);
    expect(io.write).not.toHaveBeenCalled();
  }
);

it('does not read history bytes for ordinary current-only reads or summary listing', async () => {
  const { entry } = await seed();
  expect(await getVideoProject(entry.id)).toMatchObject({
    status: 'ready',
    project: entry.project,
  });
  expect(await listVideoProjects()).toHaveLength(1);
  expect(io.read).not.toHaveBeenCalled();
});

it('opens legacy projects with absent history without writing a replacement', async () => {
  const entry = createVideoProjectEntry();
  await db.put('video_projects', entry);
  expect(await getVideoProjectWorkspace(entry.id)).toMatchObject({
    status: 'ready',
    history: { status: 'absent' },
  });
  expect(await db.get('video_projects', entry.id)).toEqual(entry);
  expect(io.read).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});
