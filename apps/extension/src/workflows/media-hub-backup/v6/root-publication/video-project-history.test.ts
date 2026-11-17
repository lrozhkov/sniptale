import '../../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  EXPECTED_STORES,
  EXPECTED_INDEXES,
} from '../../../../composition/persistence/infrastructure/indexed-db/core.stores';
import {
  ROW_REFERENCE_INDEX,
  ROW_REFERENCE_FIELD,
} from '../../../../composition/persistence/infrastructure/indexed-db/row-index-contract';
import { withIndexedRowProjections } from '../../../../composition/persistence/infrastructure/indexed-db/indexed-row-projections';
import {
  createProjectAssetEntry,
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from '../../../../composition/persistence/projects/index.test-support';
import { preparePersistedVideoProjectHistory } from '../../../../composition/persistence/projects/history-codec';
import {
  videoProjectHistoryAssetBindings,
  VIDEO_PROJECT_HISTORY_OWNER_KIND,
} from '../../../../composition/persistence/projects/history-contracts';
import {
  createVideoProjectHistoryChange,
  applyVideoProjectHistoryChangeValues,
} from '../../../../features/video/project/history-change';
import { collectVideoProjectHistorySources } from '../../../../features/video/project/history-capture';
import { getVideoProjectWorkspace } from '../../../../composition/persistence/projects';
import type { AssetRef, ArchiveRestoreSession } from '../../../../composition/persistence/assets';
import type { ArchivePathAllocator } from '../../../../composition/archive-transfer';
import { buildVideoProjectRootInventory } from '../inventory/video-projects';
import { createMediaHubBackupExportOptions } from '../options';
import { assertArchiveRootObjectInventory } from '../root-codecs/object-inventory';
import { videoProjectRootPublisher } from './video-project';
import type { StagedArchiveObject } from '../staging';
import type { MediaHubBackupRootEnvelope } from '../contracts';
import { parsePortableVideoProjectMetadata } from '../root-codecs/projects';
import { EDITOR_HISTORY_LIMITS } from '../../../../features/editor-history/policy';
import { assertMetadataJson } from '../codec';
import { parseBoundedJson } from '../codec';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from '../export';
import { inspectMediaHubBackupV6 } from '../inspect';
import { parseBackupRootEnvelope } from '../shared-object-envelope';
import { decodeBackupMetadata } from '../metadata-transport';
import { MEDIA_HUB_BACKUP_IMAGE_HISTORY_LAYOUT } from '../layout';
import { openArchiveReader } from '../../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../../composition/archive-transfer/test-support';
import { stageArchiveRootObjects } from '../staging';
import { createGuideProject } from '../../../../features/scenario/project/public';
import { encodeScenarioUnitStorage } from '../../../../composition/persistence/scenario/storage-units';
import { parseSyncCaptureRecord } from '../../../../composition/persistence/sync-capture/guards';

const io = vi.hoisted(() => ({
  db: null as IDBPDatabase | null,
  files: new Map<string, Blob>(),
  write: vi.fn(),
  read: vi.fn(),
  discard: vi.fn(),
  failReceipt: false,
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: async () => {
    if (!io.db) throw new Error('Missing test database');
    return io.db;
  },
}));
vi.mock('../../../../composition/persistence/assets', async (original) => {
  const module = await original<typeof import('../../../../composition/persistence/assets')>();
  return {
    ...module,
    writeBlobToAsset: io.write,
    readAssetFile: io.read,
    discardPreparedAsset: io.discard,
    assertAssetWriteAdmission: async () => undefined,
    createAssetObjectWriter: async ({ mimeType }: { mimeType: string }) => {
      const chunks: Blob[] = [];
      return {
        append: async (chunk: Blob) => {
          chunks.push(chunk);
        },
        abort: async () => undefined,
        finalize: async () => io.write(new Blob(chunks, { type: mimeType })),
      };
    },
    collectPreparedAssetCleanupFailures: async (ids: readonly string[]) => {
      for (const id of ids) await io.discard(id);
      return [];
    },
    completePhysicalDeleteOperation: async () => undefined,
    appendCommittedArchiveRootInTransaction: async (
      ...args: Parameters<typeof module.appendCommittedArchiveRootInTransaction>
    ) => {
      if (io.failReceipt) throw new Error('Late archive receipt failure');
      return module.appendCommittedArchiveRootInTransaction(...args);
    },
  };
});

let db: IDBPDatabase;
let databaseName: string;
async function writeAsset(blob: Blob) {
  const assetId = crypto.randomUUID();
  io.files.set(assetId, blob);
  const ref: AssetRef = {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs', objectKey: `objects/${assetId}` },
    mimeType: blob.type,
    size: blob.size,
    sha256: null,
  };
  return { ref };
}
beforeEach(async () => {
  databaseName = `archive-history-${crypto.randomUUID()}`;
  const keyPaths: Record<string, string | string[]> = {
    asset_owners: ['ownerKind', 'ownerId', 'role'],
    asset_refs: 'assetId',
    asset_operations: 'operationId',
    video_project_revisions: 'projectId',
    sync_capture: 'key',
    thumbnails: 'assetId',
    aggregate_presentations: ['aggregateKind', 'aggregateId'],
    video_workspaces: 'aggregateId',
    video_workspace_drafts: 'aggregateId',
    scenario_project_history: ['projectId', 'revision'],
    scenario_project_units: ['projectId', 'unitId', 'revision'],
  };
  db = withIndexedRowProjections(
    await openDB(databaseName, 1, {
      upgrade(database) {
        for (const name of EXPECTED_STORES) {
          const store = database.createObjectStore(name, { keyPath: keyPaths[name] ?? 'id' });
          for (const index of EXPECTED_INDEXES[name] ?? [])
            store.createIndex(index, index === ROW_REFERENCE_INDEX ? ROW_REFERENCE_FIELD : index, {
              multiEntry: index === ROW_REFERENCE_INDEX || index === 'usageReferenceKeys',
            });
        }
      },
    })
  );
  io.db = db;
  io.files.clear();
  io.failReceipt = false;
  io.write.mockReset().mockImplementation(writeAsset);
  io.read.mockReset().mockImplementation(async (ref: AssetRef, name: string) => {
    const blob = io.files.get(ref.assetId);
    if (!blob) throw new Error('Missing history bytes');
    return new File([blob], name, { type: blob.type });
  });
  io.discard.mockReset().mockImplementation(async (id: string) => {
    io.files.delete(id);
  });
});
afterEach(async () => {
  io.db = null;
  db.close();
  await deleteDB(databaseName);
});

async function scenarioParent(id: string) {
  const project = createGuideProject('Parent', id, 1);
  const graph = encodeScenarioUnitStorage(
    { id, project, createdAt: 1, updatedAt: 1, workspaceRevision: 1 },
    []
  );
  await db.put('scenario_projects', graph.head);
  for (const row of graph.rows) await db.put('scenario_project_history', row);
  for (const unit of graph.units) await db.put('scenario_project_units', unit);
}

async function exportedFixture(stageObjects = true, historicalParent?: string) {
  const before = createVideoProjectEntryWithMediaClip({ id: 'project-1', name: 'Before' }).project;
  if (historicalParent) {
    before.source = { kind: 'scenario', scenarioProjectId: historicalParent };
    await scenarioParent(historicalParent);
  }
  const current = {
    ...before,
    name: 'Draft',
    assets: [],
    clips: [],
    source: { kind: 'manual' as const },
  };
  const anchor = { ...current, name: 'Anchor' };
  const entry = createVideoProjectEntry(current, { workspaceRevision: 7 });
  const inverse = (previous: typeof before, next: typeof before) => {
    const value = JSON.stringify(createVideoProjectHistoryChange(previous, next));
    return {
      value,
      bytes: new TextEncoder().encode(value).byteLength,
      sources: collectVideoProjectHistorySources(previous),
    };
  };
  const history = await preparePersistedVideoProjectHistory({
    version: 1,
    epoch: 'original-epoch',
    past: [inverse(before, anchor)],
    future: [inverse({ ...anchor, name: 'After' }, anchor)],
    recovery: inverse(anchor, current),
  });
  await db.put('video_projects', { ...entry, history: history.history });
  for (const ref of history.refs) await db.put('asset_refs', ref);
  for (const binding of videoProjectHistoryAssetBindings(history.history))
    await db.put('asset_owners', {
      ...binding,
      ownerKind: VIDEO_PROJECT_HISTORY_OWNER_KIND,
      ownerId: entry.id,
    });
  const privateBody = await io.write(new Blob([new Uint8Array(1024)], { type: 'video/webm' }));
  await db.put(
    'project_assets',
    createProjectAssetEntry({
      id: 'project-asset-1',
      assetId: privateBody.ref.assetId,
      mimeType: privateBody.ref.mimeType,
      size: privateBody.ref.size,
    })
  );
  await db.put('asset_refs', privateBody.ref);
  await db.put('asset_owners', {
    assetId: privateBody.ref.assetId,
    ownerKind: 'project-asset',
    ownerId: 'project-asset-1',
    role: 'body',
  });
  const paths: ArchivePathAllocator = {
    reserve: (segments: readonly string[]) => segments.join('/'),
  };
  const [root] = await buildVideoProjectRootInventory({
    db,
    paths,
    options: createMediaHubBackupExportOptions({ scope: 'all', includeDrafts: true }),
  });
  if (!root) throw new Error('Missing archive root');
  const payload = await root.load();
  const envelope: MediaHubBackupRootEnvelope = {
    descriptor: root.descriptor,
    metadata: payload.metadata,
    objects: payload.objects.map((object) => object.ref),
  };
  await assertArchiveRootObjectInventory(envelope, null, []);
  const staged: StagedArchiveObject[] = [];
  for (const object of stageObjects ? payload.objects : []) {
    if (!object.blob) throw new Error('Expected retained archive bytes');
    staged.push({ ...(await io.write(object.blob)), objectId: object.ref.objectId });
  }
  return { entry, envelope, staged, root };
}

async function restoreSession(
  strategy: ArchiveRestoreSession['strategy']
): Promise<ArchiveRestoreSession> {
  const session: ArchiveRestoreSession = {
    operationId: crypto.randomUUID(),
    kind: 'archive-restore-session',
    status: 'pending',
    createdAt: 1,
    updatedAt: 1,
    archiveFingerprint: 'a'.repeat(64),
    childIdMap: {},
    rootIdMap: {},
    committedRoots: [],
    conflictedRoots: [],
    skippedRoots: [],
    currentRoot: 'video-project:project-1',
    strategy,
  };
  await db.put('asset_operations', session);
  return session;
}

function publicationArgs(
  prepared: { envelope: MediaHubBackupRootEnvelope; staged: StagedArchiveObject[] },
  session: ArchiveRestoreSession
): Parameters<typeof videoProjectRootPublisher.publish>[0] {
  return {
    ...prepared,
    session,
    journal: {
      assetRefs: prepared.staged.map((object) => object.ref),
      journalId: 'ready',
      domain: 'archive-restore-root',
      createdAt: 1,
      payload: {},
    },
  };
}

it.each(['duplicate', 'replace'] as const)(
  'restores native current, both branches, recovery and historical private media: %s',
  async (strategy) => {
    const f = await exportedFixture();
    const session = await restoreSession(strategy);
    if (!videoProjectRootPublisher.prepareStaged) throw new Error('Missing history preparation');
    const prepared = await videoProjectRootPublisher.prepareStaged({
      envelope: f.envelope,
      staged: f.staged,
      session,
    });
    const writes = io.write.mock.calls.length;
    const result = await videoProjectRootPublisher.publish(publicationArgs(prepared, session));
    expect(result.imported).toBe(true);
    expect(io.write).toHaveBeenCalledTimes(writes);
    const committed = await db.get('asset_operations', session.operationId);
    const targetId = committed.rootIdMap['video-project:project-1'];
    expect(targetId === f.entry.id).toBe(strategy === 'replace');
    const opened = await getVideoProjectWorkspace(targetId);
    if (opened.status !== 'ready' || opened.history.status !== 'ready')
      throw new Error('Restored history unavailable');
    expect(opened.project.name).toBe('Draft');
    const history = opened.history.value;
    if (!history.recovery) throw new Error('Missing gesture recovery');
    const anchor = applyVideoProjectHistoryChangeValues(opened.project, history.recovery.change);
    expect(anchor.name).toBe('Anchor');
    const before = applyVideoProjectHistoryChangeValues(anchor, history.past[0]!.change);
    expect(before.name).toBe('Before');
    expect(applyVideoProjectHistoryChangeValues(anchor, history.future[0]!.change).name).toBe(
      'After'
    );
    const source = before.assets[0]!.source;
    if (source.kind !== 'project-asset') throw new Error('Missing restored private source');
    const asset = await db.get('project_assets', source.projectAssetId);
    expect(asset).toBeDefined();
    expect(io.files.get(asset.assetId)?.size).toBe(1024);
    expect(source.projectAssetId === 'project-asset-1').toBe(strategy === 'replace');
    expect(await getVideoProjectWorkspace(targetId)).toMatchObject({
      status: 'ready',
      history: { status: 'ready' },
    });
    for (const ref of history.assetsByValue.values())
      expect(result.retainedAssetIds).toContain(ref.assetId);
  }
);

it('retries staged history after a late archive receipt rollback', async () => {
  const f = await exportedFixture();
  const session = await restoreSession('replace');
  if (!videoProjectRootPublisher.prepareStaged) throw new Error('Missing history preparation');
  const prepared = await videoProjectRootPublisher.prepareStaged({
    envelope: f.envelope,
    staged: f.staged,
    session,
  });
  const stores = [
    'video_projects',
    'project_assets',
    'asset_refs',
    'asset_owners',
    'asset_operations',
    'video_project_revisions',
  ];
  const before = await Promise.all(stores.map((name) => db.getAll(name)));
  const writes = io.write.mock.calls.length;
  io.failReceipt = true;
  await expect(
    videoProjectRootPublisher.publish(publicationArgs(prepared, session))
  ).rejects.toThrow('Late archive receipt');
  expect(await Promise.all(stores.map((name) => db.getAll(name)))).toEqual(before);
  for (const object of prepared.staged) expect(io.files.has(object.ref.assetId)).toBe(true);
  io.failReceipt = false;
  await expect(
    videoProjectRootPublisher.publish(publicationArgs(prepared, session))
  ).resolves.toMatchObject({ imported: true });
  expect(io.write).toHaveBeenCalledTimes(writes);
  expect(await getVideoProjectWorkspace(f.entry.id)).toMatchObject({
    status: 'ready',
    history: { status: 'ready' },
  });
});

it.each([false, true])(
  'admits a unit-backed historical Scenario parent and refuses its deletion before publication: deleted=%s',
  async (deleted) => {
    const f = await exportedFixture(true, 'old-parent');
    await scenarioParent('restored-parent');
    const session = await restoreSession('duplicate');
    session.rootIdMap['scenario-project:old-parent'] = 'restored-parent';
    session.committedRoots.push('scenario-project:old-parent');
    await db.put('asset_operations', session);
    await db.put('sync_capture', {
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: 1,
      enabled: true,
      spaceId: 'scenario-archive-space',
      connectionGeneration: 1,
    });
    if (!videoProjectRootPublisher.prepareStaged) throw new Error('Missing history preparation');
    const prepared = await videoProjectRootPublisher.prepareStaged({
      envelope: f.envelope,
      staged: f.staged,
      session,
    });
    if (deleted) {
      await db.delete('scenario_projects', 'restored-parent');
      const before = await Promise.all(
        ['video_projects', 'asset_refs', 'asset_owners'].map((name) => db.getAll(name))
      );
      await expect(
        videoProjectRootPublisher.publish(publicationArgs(prepared, session))
      ).rejects.toThrow('source is unavailable');
      expect(
        await Promise.all(
          ['video_projects', 'asset_refs', 'asset_owners'].map((name) => db.getAll(name))
        )
      ).toEqual(before);
      return;
    }
    await videoProjectRootPublisher.publish(publicationArgs(prepared, session));
    const committed = await db.get('asset_operations', session.operationId);
    const opened = await getVideoProjectWorkspace(committed.rootIdMap['video-project:project-1']);
    if (
      opened.status !== 'ready' ||
      opened.history.status !== 'ready' ||
      !opened.history.value.recovery
    )
      throw new Error('Missing history');
    const anchor = applyVideoProjectHistoryChangeValues(
      opened.project,
      opened.history.value.recovery.change
    );
    expect(
      applyVideoProjectHistoryChangeValues(anchor, opened.history.value.past[0]!.change).source
    ).toEqual({ kind: 'scenario', scenarioProjectId: 'restored-parent' });
  }
);

it.each(['missing', 'bad-json', 'logical-budget', 'source-closure'] as const)(
  'refuses invalid history before new staging or native publication: %s',
  async (failure) => {
    const f = await exportedFixture();
    const session = await restoreSession('replace');
    const metadata = parsePortableVideoProjectMetadata(f.envelope.metadata);
    const pointer = metadata.history?.past[0];
    const object = f.staged.find((object) => object.objectId === pointer?.objectId);
    if (!object || !metadata.history) throw new Error('Missing history fixture');
    if (failure === 'missing') io.files.delete(object.ref.assetId);
    if (failure === 'bad-json')
      io.files.set(
        object.ref.assetId,
        new Blob(['?'.repeat(object.ref.size)], { type: 'application/json' })
      );
    if (failure === 'logical-budget') object.ref.size = EDITOR_HISTORY_LIMITS.maxBytes + 1;
    if (failure === 'source-closure') {
      const malformed = {
        ...metadata,
        history: {
          ...metadata.history,
          sources: [
            ...metadata.history.sources,
            { kind: 'library-asset', id: 'undeclared-history-source' },
          ],
        },
      };
      assertMetadataJson(malformed);
      f.envelope.metadata = malformed;
    }
    const before = await Promise.all(
      ['video_projects', 'asset_refs', 'asset_owners'].map((name) => db.getAll(name))
    );
    const writes = io.write.mock.calls.length;
    if (!videoProjectRootPublisher.prepareStaged) throw new Error('Missing history preparation');
    await expect(
      videoProjectRootPublisher.prepareStaged({ envelope: f.envelope, staged: f.staged, session })
    ).rejects.toThrow();
    expect(io.write).toHaveBeenCalledTimes(writes);
    expect(
      await Promise.all(
        ['video_projects', 'asset_refs', 'asset_owners'].map((name) => db.getAll(name))
      )
    ).toEqual(before);
  }
);

it('cleans partially rebound immutable files after disk failure without changing accepted native history', async () => {
  const f = await exportedFixture();
  const session = await restoreSession('replace');
  const files = [...io.files.keys()].sort();
  const before = await db.get('video_projects', f.entry.id);
  io.write.mockImplementationOnce(writeAsset).mockRejectedValueOnce(new Error('Disk full'));
  if (!videoProjectRootPublisher.prepareStaged) throw new Error('Missing history preparation');
  await expect(
    videoProjectRootPublisher.prepareStaged({ envelope: f.envelope, staged: f.staged, session })
  ).rejects.toThrow('Disk full');
  expect([...io.files.keys()].sort()).toEqual(files);
  expect(await db.get('video_projects', f.entry.id)).toEqual(before);
});

it('skips an existing native project without reading or replacing archive history bytes', async () => {
  const f = await exportedFixture();
  const session = await restoreSession('skip');
  const before = await db.get('video_projects', f.entry.id);
  io.read.mockClear();
  io.write.mockClear();
  expect(
    await videoProjectRootPublisher.checkpointSkipIfExisting?.({ envelope: f.envelope, session })
  ).toBe(true);
  expect(io.read).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
  expect(await db.get('video_projects', f.entry.id)).toEqual(before);
});

it('carries Montage history through a real ZIP, inspection, staging and native publication', async () => {
  const f = await exportedFixture(false);
  const output = createArchiveMemorySink();
  await exportMediaHubBackupV6({
    sink: output.sink,
    plan: buildMediaHubBackupExportPlanV6({
      roots: [f.root],
      layout: MEDIA_HUB_BACKUP_IMAGE_HISTORY_LAYOUT,
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: false,
      },
    }),
  });
  const file = new File([output.blob()], 'montage.zip', { type: 'application/zip' });
  const inspection = await inspectMediaHubBackupV6(file);
  expect(inspection.rootKeys).toEqual(['video-project:project-1']);
  const reader = await openArchiveReader(file);
  try {
    const metadataEntry = reader.entry(f.root.descriptor.metadataPath);
    if (!metadataEntry) throw new Error('Missing archived project');
    const encoded = parseBackupRootEnvelope(
      parseBoundedJson(await metadataEntry.text()),
      inspection.manifest
    );
    const { envelope } = await decodeBackupMetadata(reader, encoded.envelope);
    const staged = await stageArchiveRootObjects({ envelope, reader });
    const session = await restoreSession('duplicate');
    if (!videoProjectRootPublisher.prepareStaged) throw new Error('Missing history preparation');
    const prepared = await videoProjectRootPublisher.prepareStaged({ envelope, staged, session });
    await videoProjectRootPublisher.publish(publicationArgs(prepared, session));
    const committed = await db.get('asset_operations', session.operationId);
    const opened = await getVideoProjectWorkspace(committed.rootIdMap['video-project:project-1']);
    if (opened.status !== 'ready' || opened.history.status !== 'ready')
      throw new Error('Missing archived history');
    expect(opened.project.name).toBe('Draft');
    expect(opened.history.value.past).toHaveLength(1);
    expect(opened.history.value.future).toHaveLength(1);
    expect(opened.history.value.recovery).toBeDefined();
  } finally {
    await reader.close();
  }
});

it('retains history backing in the native sync capture created by an archive restore', async () => {
  const f = await exportedFixture();
  const session = await restoreSession('replace');
  await db.put('sync_capture', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'archive-space',
    connectionGeneration: 1,
  });
  if (!videoProjectRootPublisher.prepareStaged) throw new Error('Missing history preparation');
  const prepared = await videoProjectRootPublisher.prepareStaged({
    envelope: f.envelope,
    staged: f.staged,
    session,
  });
  await videoProjectRootPublisher.publish(publicationArgs(prepared, session));
  const captures = (await db.getAll('sync_capture')).map(parseSyncCaptureRecord);
  const capture = captures.find(
    (row) => row?.kind === 'sync-operation' && row.rootKind === 'video-project'
  );
  if (
    capture?.kind !== 'sync-operation' ||
    capture.phase !== 'native' ||
    capture.change.kind !== 'video-project'
  )
    throw new Error('Missing restored capture');
  const retained = new Set(capture.change.rows.refs.map((ref) => ref.assetId));
  const native = await db.get('video_projects', f.entry.id);
  for (const binding of videoProjectHistoryAssetBindings(native.history))
    expect(retained.has(binding.assetId)).toBe(true);
  expect(capture.change.rows.assets).toHaveLength(1);
});
