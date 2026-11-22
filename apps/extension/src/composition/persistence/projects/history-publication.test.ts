import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntry } from './index.test-support';
import {
  createVideoProjectHistoryChange,
  applyVideoProjectHistoryChangeValues,
} from '../../../features/video/project/history-change';
import { collectVideoProjectHistorySources } from '../../../features/video/project/history-capture';
import { createVideoProjectTrack } from '../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../features/video/project/types';
import { preparePersistedVideoProjectHistory } from './history-codec';
import { getVideoProject, getVideoProjectWorkspace, saveVideoProject } from './index';
import { deleteVideoProjectInTransaction } from './index.delete';
import { putVideoProjectBackupRestore } from './backup-restore';
import { buildPhysicalDeleteOperation } from '../assets';
import {
  VIDEO_PROJECT_HISTORY_OWNER_KIND,
  videoProjectHistoryAssetBindings,
} from './history-contracts';
import type { AssetRef } from '../assets/contracts';
import type { AssetReadyJournal } from '../assets/contracts';
import { EXPECTED_STORES } from '../infrastructure/indexed-db/core.stores';
import {
  createVideoProjectWorkspaceCommit,
  prepareVideoProjectWorkspaceCommit,
  recoverVideoProjectWorkspacePublications,
} from './workspace-commit';
import { parseAssetReadyJournal } from '../assets/guards';
import { collectReadyJournalAssetIds } from '../assets/retention-claims';
import { deferCheckpointInTransaction } from '../sync-capture/checkpoints';
import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { EDITOR_HISTORY_LIMITS } from '../../../features/editor-history/policy';
import { parseVideoProjectHistoryCheckpoint } from '../../../features/video/project/history-checkpoint';
import { isHydratableVideoProject } from '../../../features/video/project/validation';

const io = vi.hoisted(() => ({
  db: null as IDBPDatabase | null,
  files: new Map<string, Blob>(),
  read: vi.fn(),
  write: vi.fn(),
  journals: new Map<string, AssetReadyJournal>(),
  beforePublish: null as ((journal: AssetReadyJournal) => Promise<void>) | null,
  loseAck: false,
  legacyFileFixtures: true,
  cancel: vi.fn(),
}));
vi.mock('./history-codec', async (original) => {
  const actual = await original<typeof import('./history-codec')>();
  return {
    ...actual,
    preparePersistedVideoProjectHistory: (
      capture: Parameters<typeof actual.preparePersistedVideoProjectHistory>[0],
      reusable?: Parameters<typeof actual.preparePersistedVideoProjectHistory>[1]
    ) =>
      actual.preparePersistedVideoProjectHistory(capture, reusable, io.legacyFileFixtures ? 1 : 2),
  };
});
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
  createAssetPublicationJournal: async (input: {
    domain: string;
    payload: unknown;
    assetRefs: AssetRef[];
  }) => {
    const journal = { ...input, createdAt: 1, journalId: crypto.randomUUID() };
    io.journals.set(journal.journalId, journal);
    return journal;
  },
  publishReadyJournalWithRetry: async (
    journal: AssetReadyJournal,
    publish: (journal: AssetReadyJournal) => Promise<void>
  ) => {
    await io.beforePublish?.(journal);
    await publish(journal);
    if (io.loseAck) {
      io.loseAck = false;
      throw new Error('Lost acknowledgement');
    }
    io.journals.delete(journal.journalId);
  },
  releaseAssetReadyProtection: async () => undefined,
  completePhysicalDeleteOperation: async () => undefined,
  collectPreparedAssetCleanupFailures: async (ids: readonly string[]) => {
    for (const id of ids) io.files.delete(id);
    return [];
  },
}));
vi.mock('./asset-publication', async (original) => ({
  ...(await original<typeof import('./asset-publication')>()),
  recoverProjectMediaPublications: async () => undefined,
}));
vi.mock('../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../assets/opfs-store')>()),
  listReadyJournals: async () => [...io.journals.values()],
  deleteReadyJournal: async (id: string) => {
    io.journals.delete(id);
  },
}));
vi.mock('../assets/publication', async (original) => ({
  ...(await original<typeof import('../assets/publication')>()),
  cancelAssetPublication: io.cancel,
}));
let db: IDBPDatabase;
let name: string;
beforeEach(async () => {
  name = `montage-history-${crypto.randomUUID()}`;
  db = await openDB(name, 1, {
    upgrade(database) {
      for (const store of EXPECTED_STORES) {
        const keyPath =
          store === 'asset_owners'
            ? ['ownerKind', 'ownerId', 'role']
            : store === 'asset_refs'
              ? 'assetId'
              : store === 'video_project_revisions'
                ? 'projectId'
                : store === 'asset_operations'
                  ? 'operationId'
                  : store === 'sync_capture'
                    ? 'key'
                    : 'id';
        const created = database.createObjectStore(store, { keyPath });
        if (store === 'asset_owners') created.createIndex('assetId', 'assetId');
        if (store === 'project_exports') created.createIndex('projectId', 'projectId');
      }
    },
  });
  io.db = db;
  io.legacyFileFixtures = true;
  io.files.clear();
  io.journals.clear();
  io.beforePublish = null;
  io.loseAck = false;
  io.cancel.mockReset().mockImplementation(async (journal: AssetReadyJournal) => {
    for (const ref of journal.assetRefs) {
      if ((await db.countFromIndex('asset_owners', 'assetId', ref.assetId)) === 0)
        io.files.delete(ref.assetId);
    }
    io.journals.delete(journal.journalId);
  });
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
async function seed(tracks?: ReturnType<typeof createVideoProjectTrack>[]) {
  const entry = createVideoProjectEntry(
    { name: 'Current', ...(tracks ? { tracks } : {}) },
    { workspaceRevision: 7 }
  );
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
    await tx
      .objectStore('asset_owners')
      .put({ ...binding, ownerKind: VIDEO_PROJECT_HISTORY_OWNER_KIND, ownerId: entry.id });
  await tx.done;
  return { entry, prepared, before, after };
}

it.each(['replace', 'skip', 'abort'] as const)(
  'retires replaced native history atomically: %s',
  async (mode) => {
    const { entry, prepared } = await seed();
    const original = await db.get('video_projects', entry.id);
    const [shared, retired] = prepared.refs;
    if (!shared || !retired) throw new Error('Expected both history directions.');
    await db.put('asset_owners', {
      assetId: shared.assetId,
      ownerKind: 'external',
      ownerId: 'other',
      role: 'body',
    });
    const beforeOwners = await db.getAll('asset_owners');
    const beforeRefs = await db.getAll('asset_refs');
    await db.put('asset_operations', { operationId: 'existing-receipt' });
    const operation = buildPhysicalDeleteOperation([]);
    const tx = db.transaction([...EXPECTED_STORES], 'readwrite');
    const result = await putVideoProjectBackupRestore({
      operation,
      root: {
        assets: [],
        exports: [],
        entry: { ...entry, project: { ...entry.project, name: 'Restored' } },
      },
      strategy: mode === 'skip' ? 'skip' : 'replace',
      tx,
      stores: {
        assets: tx.objectStore('project_assets'),
        exports: tx.objectStore('project_exports'),
        imageIdentities: tx.objectStore('image_workspace_identities'),
        media: tx.objectStore('media_library'),
        videoWorkspaces: tx.objectStore('video_workspaces'),
        videoDrafts: tx.objectStore('video_workspace_drafts'),
        operations: tx.objectStore('asset_operations'),
        owners: tx.objectStore('asset_owners'),
        presentations: tx.objectStore('aggregate_presentations'),
        projects: tx.objectStore('video_projects'),
        refs: tx.objectStore('asset_refs'),
        thumbnails: tx.objectStore('thumbnails'),
        scenarioAssets: tx.objectStore('scenario_assets'),
      },
    });
    if (mode === 'abort') {
      // A later caller-owned receipt failure must roll back the complete replacement.
      await expect(
        tx.objectStore('asset_operations').add({ operationId: 'existing-receipt' })
      ).rejects.toThrow();
      await expect(tx.done).rejects.toThrow();
    } else await tx.done;
    if (mode !== 'replace') {
      expect(await db.get('video_projects', entry.id)).toEqual(original);
      expect(await db.getAll('asset_owners')).toEqual(beforeOwners);
      expect(await db.getAll('asset_refs')).toEqual(beforeRefs);
      if (mode === 'skip') expect(result.imported).toBe(false);
      return;
    }
    expect(result.imported).toBe(true);
    expect((await db.get('video_projects', entry.id)).project.name).toBe('Restored');
    expect(await db.getAll('asset_owners')).toEqual([
      { assetId: shared.assetId, ownerKind: 'external', ownerId: 'other', role: 'body' },
    ]);
    expect(await db.get('asset_refs', shared.assetId)).toEqual(shared);
    expect(await db.get('asset_refs', retired.assetId)).toBeUndefined();
    expect(operation.assetIds).toEqual([retired.assetId]);
  }
);

function gate() {
  let release: () => void = () => {
    throw new Error('Gate is not installed');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

function attempt(entry: ReturnType<typeof createVideoProjectEntry>, name = 'Edited') {
  const project = { ...entry.project, name };
  const value = JSON.stringify(createVideoProjectHistoryChange(entry.project, project));
  return createVideoProjectWorkspaceCommit({
    project,
    expectedProject: entry.project,
    expectedWorkspaceRevision: entry.workspaceRevision ?? 0,
    history: {
      version: 1,
      epoch: 'epoch',
      past: [
        {
          value,
          bytes: new TextEncoder().encode(value).byteLength,
          sources: collectVideoProjectHistorySources(entry.project),
        },
      ],
      future: [],
    },
  });
}

it('replaces released file history with inline metadata and journals obsolete byte retirement', async () => {
  const { entry, prepared } = await seed();
  const retired = prepared.refs.map((ref) => ref.assetId);
  expect(retired).toHaveLength(2);
  io.legacyFileFixtures = false;
  io.write.mockClear();
  await attempt(entry)();
  expect(io.write).not.toHaveBeenCalled();
  const stored = await db.get('video_projects', entry.id);
  expect(stored.history).toMatchObject({ version: 2, past: [{ value: expect.any(String) }] });
  expect(await db.count('asset_owners')).toBe(0);
  expect(await db.count('asset_refs')).toBe(0);
  const operations = await db.getAll('asset_operations');
  expect(operations.flatMap((operation) => operation.assetIds ?? []).sort()).toEqual(
    retired.sort()
  );
  expect(await getVideoProjectWorkspace(entry.id)).toMatchObject({
    status: 'ready',
    history: { status: 'ready' },
  });
});

it('refuses changed project birth facts before preparing immutable history', async () => {
  const { entry } = await seed();
  const before = await db.get('video_projects', entry.id);
  io.write.mockClear();
  const commit = createVideoProjectWorkspaceCommit({
    project: { ...entry.project, createdAt: entry.project.createdAt + 1 },
    expectedProject: entry.project,
    expectedWorkspaceRevision: entry.workspaceRevision ?? 0,
    history: { version: 1, epoch: 'epoch', past: [], future: [] },
  });
  await expect(commit()).rejects.toThrow();
  expect(io.write).not.toHaveBeenCalled();
  expect(io.journals.size).toBe(0);
  expect(await db.get('video_projects', entry.id)).toEqual(before);
});

it.each(['past', 'recovery'])(
  'refuses %s that fits raw payload bytes but exceeds the checkpoint wire budget',
  async (branch) => {
    const { entry } = await seed();
    const current = entry.project;
    const empty = JSON.stringify(
      createVideoProjectHistoryChange({ ...current, name: '' }, current)
    );
    const before = {
      ...current,
      name: 'x'.repeat(
        EDITOR_HISTORY_LIMITS.maxBytes - 16 - new TextEncoder().encode(empty).byteLength
      ),
    };
    expect(isHydratableVideoProject(before)).toBe(true);
    const value = JSON.stringify(createVideoProjectHistoryChange(before, current));
    const bytes = new TextEncoder().encode(value).byteLength;
    expect(bytes).toBe(EDITOR_HISTORY_LIMITS.maxBytes - 16);
    const rawChange: unknown = JSON.parse(value);
    expect(
      parseVideoProjectHistoryCheckpoint(
        {
          version: 1,
          projectId: current.id,
          past: [rawChange],
          future: [],
        },
        current,
        EDITOR_HISTORY_LIMITS
      )
    ).toBeNull();
    const original = { ...entry, project: before };
    await db.put('video_projects', original);
    io.write.mockClear();
    const commit = createVideoProjectWorkspaceCommit({
      project: current,
      expectedProject: before,
      expectedWorkspaceRevision: 7,
      history: {
        version: 1,
        epoch: 'epoch',
        future: [],
        past:
          branch === 'past'
            ? [{ value, bytes, sources: collectVideoProjectHistorySources(before) }]
            : [],
        ...(branch === 'recovery'
          ? { recovery: { value, bytes, sources: collectVideoProjectHistorySources(before) } }
          : {}),
      },
    });
    await expect(commit()).rejects.toThrow('budget');
    expect(io.write).not.toHaveBeenCalled();
    expect(io.journals.size).toBe(0);
    expect(await db.get('video_projects', current.id)).toEqual(original);
  }
);

it.each([1, 2])(
  'admits one history publication for parallel writers of the same native revision (format %i)',
  async (format) => {
    io.legacyFileFixtures = format === 1;
    const { entry } = await seed();
    const bothPrepared = gate();
    const publish = gate();
    let count = 0;
    io.beforePublish = async () => {
      if (++count === 2) bothPrepared.release();
      await publish.promise;
    };
    const first = attempt(entry, 'First writer')();
    const second = attempt(entry, 'Second writer')();
    await bothPrepared.promise;
    publish.release();
    const settled = await Promise.allSettled([first, second]);
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = settled.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { name: 'SupersededAssetPublicationError' },
    });
    const stored = await db.get('video_projects', entry.id);
    expect(stored.workspaceRevision).toBe(8);
    expect(stored.history.past).toHaveLength(1);
    const owners = await db.getAll('asset_owners');
    expect(owners).toHaveLength(format === 1 ? 1 : 0);
    if (format === 1) expect(owners[0].assetId).toBe(stored.history.past[0].assetId);
    else
      expect(stored.history).toMatchObject({ version: 2, past: [{ value: expect.any(String) }] });
    expect(await db.count('asset_refs')).toBe(format === 1 ? 1 : 0);
    expect(await getVideoProjectWorkspace(entry.id)).toMatchObject({
      status: 'ready',
      history: { status: 'ready' },
    });
  }
);

it.each([1, 2])(
  'retries the same prepared publication after committed-but-lost acknowledgement (format %i)',
  async (format) => {
    io.legacyFileFixtures = format === 1;
    const { entry } = await seed();
    io.write.mockClear();
    const commit = attempt(entry);
    io.loseAck = true;
    await expect(commit()).rejects.toThrow('Lost acknowledgement');
    const committed = await db.get('video_projects', entry.id);
    expect(committed.workspaceRevision).toBe(8);
    expect(io.journals.size).toBe(1);
    const saved = await commit();
    expect(saved.workspaceRevision).toBe(8);
    expect(saved.historyPublicationId).toBe(committed.historyPublicationId);
    expect(await db.get('video_projects', entry.id)).toEqual(committed);
    expect(io.write).toHaveBeenCalledTimes(format === 1 ? 1 : 0);
    expect(io.journals.size).toBe(0);
  }
);

it('keeps its sync receipt after a lost ACK without adopting newer pending work', async () => {
  const { entry } = await seed();
  await db.put('sync_capture', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'receipt-space',
    connectionGeneration: 1,
    checkpointIntervalMs: 300000,
  });
  io.write.mockClear();
  const commit = attempt(entry);
  io.loseAck = true;
  await expect(commit()).rejects.toThrow('Lost acknowledgement');
  const original = (await db.getAll('sync_capture'))
    .map(parseSyncCaptureRecord)
    .find((record) => record?.kind === 'pending-checkpoint');
  if (!original || original.kind !== 'pending-checkpoint') throw new Error('Missing checkpoint');
  const tx = db.transaction(['sync_capture'], 'readwrite');
  const newer = await deferCheckpointInTransaction(tx, {
    rootKind: 'video-project',
    rootId: entry.id,
  });
  await tx.done;
  expect(newer?.revision).not.toBe(original.revision);
  const saved = await commit();
  expect(saved.checkpointReceipt).toEqual({
    rootKind: 'video-project',
    rootId: entry.id,
    revision: original.revision,
  });
  const pending = parseSyncCaptureRecord(await db.get('sync_capture', original.key));
  expect(pending).toMatchObject({ revision: newer?.revision });
  expect(saved.workspaceRevision).toBe(8);
  expect(io.write).toHaveBeenCalledTimes(1);
});

it('preserves staged files and current metadata on retryable publication failure', async () => {
  const { entry } = await seed();
  const before = await db.get('video_projects', entry.id);
  io.write.mockClear();
  io.beforePublish = async () => {
    throw new Error('Temporarily unavailable');
  };
  const commit = attempt(entry);
  await expect(commit()).rejects.toThrow('Temporarily unavailable');
  expect(await db.get('video_projects', entry.id)).toEqual(before);
  expect(io.journals.size).toBe(1);
  const journal = [...io.journals.values()][0]!;
  expect(collectReadyJournalAssetIds(journal)).toEqual(journal.assetRefs.map((ref) => ref.assetId));
  expect(journal.assetRefs.every((ref) => io.files.has(ref.assetId))).toBe(true);
  io.beforePublish = null;
  expect(await commit()).toMatchObject({ workspaceRevision: 8, project: { name: 'Edited' } });
  expect(io.write).toHaveBeenCalledTimes(1);
});

it('rejects an opening save bound to an older observed workspace revision', async () => {
  const { entry } = await seed();
  await db.put('video_projects', { ...entry, workspaceRevision: 9 });
  io.write.mockClear();
  await expect(attempt(entry)()).rejects.toMatchObject({ name: 'StaleVideoProjectSaveError' });
  expect(io.write).not.toHaveBeenCalled();
  expect(await db.get('video_projects', entry.id)).toMatchObject({ workspaceRevision: 9 });
});

it('rolls back current history resources and revision when capture admission fails', async () => {
  const { entry } = await seed();
  const original = await db.get('video_projects', entry.id);
  const owners = await db.getAll('asset_owners');
  const refs = await db.getAll('asset_refs');
  await db.put('sync_capture', { key: 'profile', version: -1, kind: 'profile' });
  const commit = attempt(entry);
  await expect(commit()).rejects.toThrow('Invalid sync capture profile');
  expect(await db.get('video_projects', entry.id)).toEqual(original);
  expect(await db.getAll('asset_owners')).toEqual(owners);
  expect(await db.getAll('asset_refs')).toEqual(refs);
  expect(await db.get('video_project_revisions', entry.id)).toBeUndefined();
  expect(io.journals.size).toBe(1);
  await db.delete('sync_capture', 'profile');
  expect(await commit()).toMatchObject({ workspaceRevision: 8 });
});

it('retains borrowed history files in the same ready claim without staging them again', async () => {
  const { entry } = await seed();
  const loaded = await getVideoProjectWorkspace(entry.id);
  if (loaded.status !== 'ready' || loaded.history.status !== 'ready')
    throw new Error('Missing history');
  const previous = loaded.history.value;
  const project = { ...entry.project, name: 'Edited' };
  const value = JSON.stringify(createVideoProjectHistoryChange(entry.project, project));
  io.write.mockClear();
  const commit = createVideoProjectWorkspaceCommit({
    project,
    expectedProject: entry.project,
    expectedWorkspaceRevision: 7,
    reusableHistoryAssetsByValue: previous.assetsByValue,
    history: {
      version: 1,
      epoch: previous.epoch,
      past: [
        ...previous.past.map((entry) => ({
          ...entry,
          bytes: new TextEncoder().encode(entry.value).byteLength,
        })),
        {
          value,
          bytes: new TextEncoder().encode(value).byteLength,
          sources: collectVideoProjectHistorySources(entry.project),
        },
      ],
      future: [],
    },
  });
  io.beforePublish = async () => {
    throw new Error('Held publication');
  };
  await expect(commit()).rejects.toThrow('Held publication');
  const journal = [...io.journals.values()][0]!;
  expect(journal.assetRefs).toHaveLength(1);
  expect(collectReadyJournalAssetIds(journal)).toHaveLength(2);
  expect(io.write).toHaveBeenCalledTimes(1);
  io.beforePublish = null;
  const saved = await commit();
  expect(saved.history?.past).toHaveLength(2);
  expect(saved.workspaceRevision).toBe(8);
  expect(io.write).toHaveBeenCalledTimes(1);
  expect(await getVideoProjectWorkspace(entry.id)).toMatchObject({
    status: 'ready',
    history: { status: 'ready' },
  });
});

async function removeProject(id: string) {
  const tx = db.transaction([...EXPECTED_STORES], 'readwrite');
  await deleteVideoProjectInTransaction(tx, id, buildPhysicalDeleteOperation([]));
  await tx.done;
}

it.each([1, 2])(
  'refuses a prepared history publication after deletion and same-identity recreation (format %i)',
  async (format) => {
    io.legacyFileFixtures = format === 1;
    const { entry } = await seed();
    const prepared = gate();
    const publish = gate();
    io.beforePublish = async () => {
      prepared.release();
      await publish.promise;
    };
    const committing = attempt(entry)();
    await prepared.promise;
    await removeProject(entry.id);
    const replacement = await saveVideoProject(entry.project, {
      expectedWorkspaceRevision: null,
      expectedProject: null,
    });
    expect(replacement.workspaceRevision).toBe(8);
    publish.release();
    await expect(committing).rejects.toMatchObject({ name: 'SupersededAssetPublicationError' });
    expect(await db.get('video_projects', entry.id)).toMatchObject(replacement);
  }
);

it('does not resurrect a missing root after an intervening creation and deletion', async () => {
  const entry = createVideoProjectEntry();
  const project = { ...entry.project, name: 'Pending birth' };
  const prepared = gate();
  const publish = gate();
  io.beforePublish = async () => {
    prepared.release();
    await publish.promise;
  };
  const committing = createVideoProjectWorkspaceCommit({
    project,
    expectedWorkspaceRevision: null,
    expectedProject: null,
    history: { version: 1, epoch: 'birth', past: [], future: [] },
  })();
  await prepared.promise;
  const intervening = await saveVideoProject(entry.project, {
    expectedWorkspaceRevision: null,
    expectedProject: null,
  });
  expect(intervening.workspaceRevision).toBe(1);
  await removeProject(entry.id);
  publish.release();
  await expect(committing).rejects.toMatchObject({ name: 'SupersededAssetPublicationError' });
  expect(await db.get('video_projects', entry.id)).toBeUndefined();
  expect(await db.get('video_project_revisions', entry.id)).toMatchObject({ revision: 1 });
});

it('releases immutable history files only after the last native project owner is deleted', async () => {
  const { entry, prepared } = await seed();
  const second = {
    ...entry,
    id: 'second',
    project: { ...entry.project, id: 'second' },
    history: prepared.history,
  };
  await db.put('video_projects', second);
  for (const binding of videoProjectHistoryAssetBindings(prepared.history))
    await db.put('asset_owners', {
      ...binding,
      ownerKind: VIDEO_PROJECT_HISTORY_OWNER_KIND,
      ownerId: second.id,
    });
  const firstDelete = buildPhysicalDeleteOperation([]);
  const first = db.transaction([...EXPECTED_STORES], 'readwrite');
  await deleteVideoProjectInTransaction(first, entry.id, firstDelete);
  await first.done;
  expect(firstDelete.assetIds).toEqual([]);
  expect(await db.count('asset_refs')).toBe(2);
  expect(await db.count('asset_owners')).toBe(2);
  const lastDelete = buildPhysicalDeleteOperation([]);
  const last = db.transaction([...EXPECTED_STORES], 'readwrite');
  await deleteVideoProjectInTransaction(last, second.id, lastDelete);
  await last.done;
  expect(new Set(lastDelete.assetIds)).toEqual(new Set(prepared.refs.map((ref) => ref.assetId)));
  expect(await db.count('asset_refs')).toBe(0);
  expect(await db.count('asset_owners')).toBe(0);
});

it('refuses an old lost-ACK retry after a newer history publication', async () => {
  const { entry } = await seed();
  const commit = attempt(entry);
  io.loseAck = true;
  await expect(commit()).rejects.toThrow('Lost acknowledgement');
  const loaded = await getVideoProjectWorkspace(entry.id);
  if (loaded.status !== 'ready') throw new Error('Missing saved project');
  const newer = await attempt(
    { ...entry, project: loaded.project, workspaceRevision: loaded.workspaceRevision },
    'Newer edit'
  )();
  await expect(commit()).rejects.toMatchObject({ name: 'SupersededAssetPublicationError' });
  expect(await db.get('video_projects', entry.id)).toMatchObject({
    project: newer.project,
    workspaceRevision: 9,
    historyPublicationId: newer.historyPublicationId,
  });
});

function restartJournal(): AssetReadyJournal {
  const journal = [...io.journals.values()][0];
  if (!journal) throw new Error('Missing ready journal');
  const raw: unknown = JSON.parse(JSON.stringify(journal));
  const restored = parseAssetReadyJournal(raw);
  if (!restored) throw new Error('Invalid ready fixture');
  io.journals.set(restored.journalId, restored);
  return restored;
}

async function interrupted() {
  const seeded = await seed();
  io.beforePublish = async () => {
    throw new Error('Editor terminated before publication');
  };
  await expect(attempt(seeded.entry)()).rejects.toThrow('Editor terminated');
  const journal = restartJournal();
  io.beforePublish = null;
  io.read.mockClear();
  io.write.mockClear();
  return { ...seeded, journal };
}

it('replays a cold prepared current and history exactly once without a live editor closure', async () => {
  const { entry, journal } = await interrupted();
  expect(await recoverVideoProjectWorkspacePublications()).toBe(1);
  const saved = await db.get('video_projects', entry.id);
  expect(saved).toMatchObject({
    workspaceRevision: 8,
    project: { name: 'Edited' },
    historyPublicationId: journal.journalId,
  });
  expect(await getVideoProjectWorkspace(entry.id)).toMatchObject({
    status: 'ready',
    history: { status: 'ready' },
  });
  expect(await recoverVideoProjectWorkspacePublications()).toBe(0);
  expect(await db.get('video_projects', entry.id)).toEqual(saved);
  expect(io.write).not.toHaveBeenCalled();
});

it('settles an already committed cold acknowledgement without reading unavailable file payloads', async () => {
  const { entry } = await seed();
  io.loseAck = true;
  await expect(attempt(entry)()).rejects.toThrow('Lost acknowledgement');
  const journal = restartJournal();
  const saved = await db.get('video_projects', entry.id);
  for (const ref of journal.assetRefs) io.files.delete(ref.assetId);
  io.read.mockClear();
  expect(await recoverVideoProjectWorkspacePublications()).toBe(1);
  expect(io.read).not.toHaveBeenCalled();
  expect(await db.get('video_projects', entry.id)).toEqual(saved);
  expect(io.journals.size).toBe(0);
});

it('retires a stale cold journal before file IO without removing published or borrowed files', async () => {
  const { entry, prepared, journal } = await interrupted();
  await removeProject(entry.id);
  const replacement = await saveVideoProject(entry.project, {
    expectedProject: null,
    expectedWorkspaceRevision: null,
  });
  // Another admitted owner can retain a staged object after the old attempt became obsolete.
  const ref = journal.assetRefs[0]!;
  await db.put('asset_owners', {
    ownerKind: 'external',
    ownerId: 'other',
    role: 'body',
    assetId: ref.assetId,
  });
  expect(await recoverVideoProjectWorkspacePublications()).toBe(1);
  expect(io.read).not.toHaveBeenCalled();
  expect(io.cancel).toHaveBeenCalledWith(journal, expect.anything());
  expect(journal.assetRefs.every((ref) => io.files.has(ref.assetId))).toBe(true);
  expect(prepared.refs.every((ref) => io.files.has(ref.assetId))).toBe(true);
  expect(await db.get('video_projects', entry.id)).toMatchObject(replacement);
});

it.each([
  'history-version',
  'predecessor',
  'revision',
  'duplicate-ref',
  'extra-ref',
  'digest',
  'staged-ref',
])('preserves the current root and malformed ready evidence before IO: %s', async (failure) => {
  const { entry, journal } = await interrupted();
  const original = await db.get('video_projects', entry.id);
  const payload = journal.payload;
  if (typeof payload !== 'object' || payload === null) throw new Error('Missing fixture payload');
  const refs: unknown = Reflect.get(payload, 'refs');
  if (!Array.isArray(refs)) throw new Error('Missing fixture refs');
  if (failure === 'history-version') Reflect.set(payload, 'history', { version: 99 });
  if (failure === 'predecessor')
    Reflect.set(payload, 'expectedProject', { ...entry.project, id: 'different' });
  if (failure === 'revision') Reflect.set(payload, 'expectedRetainedRevision', -1);
  if (failure === 'duplicate-ref') refs.push(refs[0]);
  if (failure === 'extra-ref')
    refs.push({
      ...journal.assetRefs[0],
      assetId: 'foreign',
      location: { kind: 'opfs', objectKey: 'objects/foreign' },
    });
  if (failure === 'digest') Reflect.set(refs[0], 'sha256', null);
  if (failure === 'staged-ref')
    journal.assetRefs.push({
      ...journal.assetRefs[0]!,
      assetId: 'foreign',
      location: { kind: 'opfs', objectKey: 'objects/foreign' },
    });
  await expect(recoverVideoProjectWorkspacePublications()).rejects.toThrow(
    'Invalid video project workspace'
  );
  expect(io.read).not.toHaveBeenCalled();
  expect(io.cancel).not.toHaveBeenCalled();
  expect(io.journals.has(journal.journalId)).toBe(true);
  expect(await db.get('video_projects', entry.id)).toEqual(original);
});

it('preserves current metadata and ready files when a cold history digest does not match', async () => {
  const { entry, journal } = await interrupted();
  const original = await db.get('video_projects', entry.id);
  const ref = journal.assetRefs[0]!;
  const blob = io.files.get(ref.assetId)!;
  io.files.set(ref.assetId, new Blob(['x'.repeat(blob.size)], { type: 'application/json' }));
  await expect(recoverVideoProjectWorkspacePublications()).rejects.toThrow('digest');
  expect(await db.get('video_projects', entry.id)).toEqual(original);
  expect(io.journals.has(journal.journalId)).toBe(true);
  expect(io.cancel).not.toHaveBeenCalled();
});

it('rejects a replacement lifetime that wins during cold history file IO', async () => {
  const { entry } = await interrupted();
  const reading = gate();
  const resume = gate();
  const read = io.read.getMockImplementation()!;
  io.read.mockImplementationOnce(async (ref: AssetRef, name: string) => {
    reading.release();
    await resume.promise;
    return read(ref, name);
  });
  const recovering = recoverVideoProjectWorkspacePublications();
  await Promise.race([
    reading.promise,
    recovering.then(() => {
      throw new Error('Recovery finished before the IO gate');
    }),
  ]);
  let replacement;
  try {
    await removeProject(entry.id);
    replacement = await saveVideoProject(entry.project, {
      expectedProject: null,
      expectedWorkspaceRevision: null,
    });
  } finally {
    resume.release();
  }
  expect(await recovering).toBe(1);
  expect(await db.get('video_projects', entry.id)).toMatchObject(replacement);
  expect(io.cancel).toHaveBeenCalledTimes(1);
});

it('cannot mint a second revision when two cold recoveries resume the same journal', async () => {
  const { entry, journal } = await interrupted();
  await Promise.all([
    recoverVideoProjectWorkspacePublications(),
    recoverVideoProjectWorkspacePublications(),
  ]);
  expect(await db.get('video_projects', entry.id)).toMatchObject({
    workspaceRevision: 8,
    historyPublicationId: journal.journalId,
  });
  expect(await db.get('video_project_revisions', entry.id)).toMatchObject({ revision: 8 });
  expect(io.journals.size).toBe(0);
  expect(io.write).not.toHaveBeenCalled();
});

it.each([1, 2])(
  'persists an unfinished gesture separately from its pre-gesture Undo and Redo anchor (format %i)',
  async (format) => {
    io.legacyFileFixtures = format === 1;
    const { entry, before } = await seed([
      createVideoProjectTrack('Video', 0, VideoTrackKind.PRIMARY, true),
      createVideoProjectTrack('Audio', 1, VideoTrackKind.AUDIO),
    ]);
    expect(entry.project.tracks.length).toBeGreaterThan(1);
    const draft = {
      ...entry.project,
      name: 'Partial gesture',
      tracks: entry.project.tracks.slice(0, 1),
    };
    const later = {
      ...entry.project,
      name: 'Redo target',
      tracks: entry.project.tracks.map((track, index) =>
        index === 1 ? { ...track, name: 'Redo track' } : track
      ),
    };
    const value = (target: typeof entry.project, anchor: typeof entry.project) => {
      const value = JSON.stringify(createVideoProjectHistoryChange(target, anchor));
      return {
        value,
        bytes: new TextEncoder().encode(value).byteLength,
        sources: collectVideoProjectHistorySources(target),
      };
    };
    const saved = await createVideoProjectWorkspaceCommit({
      project: draft,
      expectedProject: entry.project,
      expectedWorkspaceRevision: 7,
      history: {
        version: 1,
        epoch: 'epoch',
        past: [value(before, entry.project)],
        future: [value(later, entry.project)],
        recovery: value(entry.project, draft),
      },
    })();
    expect(saved.history?.recovery).toBeDefined();
    expect(saved.history?.future).toHaveLength(1);
    const loaded = await getVideoProjectWorkspace(entry.id);
    if (loaded.status !== 'ready' || loaded.history.status !== 'ready')
      throw new Error('Missing draft history');
    expect(loaded.project.name).toBe('Partial gesture');
    const recovery = loaded.history.value.recovery;
    expect(recovery).toBeDefined();
    const anchor = applyVideoProjectHistoryChangeValues(loaded.project, recovery!.change);
    expect(anchor).toEqual({ ...entry.project, updatedAt: loaded.project.updatedAt });
    expect(
      applyVideoProjectHistoryChangeValues(anchor, loaded.history.value.past[0]!.change)
    ).toEqual({ ...before, updatedAt: loaded.project.updatedAt });
    expect(
      applyVideoProjectHistoryChangeValues(anchor, loaded.history.value.future[0]!.change)
    ).toEqual({ ...later, updatedAt: loaded.project.updatedAt });
    expect(await db.count('asset_owners')).toBe(format === 1 ? 3 : 0);
  }
);

it('accepts a ready retry handle before publication and retries without preparing another graph', async () => {
  const { entry, prepared } = await seed();
  const loaded = await getVideoProjectWorkspace(entry.id);
  if (loaded.status !== 'ready' || loaded.history.status !== 'ready')
    throw new Error('Missing workspace');
  const publish = await prepareVideoProjectWorkspaceCommit({
    project: entry.project,
    expectedProject: entry.project,
    expectedWorkspaceRevision: 7,
    history: {
      version: 1,
      epoch: loaded.history.value.epoch,
      past: loaded.history.value.past,
      future: loaded.history.value.future,
    },
    reusableHistoryAssetsByValue: loaded.history.value.assetsByValue,
  });
  expect(io.journals.size).toBe(1);
  expect(await getVideoProject(entry.id)).toMatchObject({ workspaceRevision: 7 });
  const writes = io.write.mock.calls.length;
  io.loseAck = true;
  await expect(publish()).rejects.toThrow('Lost acknowledgement');
  const first = await getVideoProject(entry.id);
  expect(first).toMatchObject({ workspaceRevision: 8 });
  await expect(publish()).resolves.toMatchObject({ workspaceRevision: 8 });
  expect(io.write).toHaveBeenCalledTimes(writes);
  expect(io.journals.size).toBe(0);
  expect(prepared.refs.every((ref) => io.files.has(ref.assetId))).toBe(true);
});
