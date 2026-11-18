import { completePhysicalDeleteOperation } from '../../../assets/operations';
import { parsePhysicalDeleteAssetOperation } from '../../../assets/guards';
import { withIndexedRowProjections } from '../indexed-row-projections';
import type { AssetRef } from '../../../assets/contracts';
import { readImageOriginalSource } from '../../../image-workspaces/read';
import { imageWorkspaceAssetBindings } from '../../../image-workspaces/assets';
import type { StoredImageWorkspaceEntry } from '../../../image-workspaces/contracts';
import { createPersistedEditorDocumentFixture } from '../../../document-assets/test-support';
import { createMediaLibraryEntry } from '../../../projects/index.test-support';
import {
  legacyImageProjectId,
  legacyQuickEditProjectId,
} from '../../../media-library/legacy-projects';
import { workspace as previousQuickEdit } from '../../../review-workspaces/backup-restore.test-support';
import { materializeVideoWorkspaceProject } from '../../../review-workspaces/project-metadata';
import { materializeWorkspaceStorage } from '../../../review-workspaces/storage-format';
import { createEditorDocumentFixture } from '../../../../../editor/document/page-session/document.test-support';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../../../features/editor/document/constants';
import { createNewWorkspacePresentationSettings } from '../../../../../features/video/review/advanced/presentation';
import '../fake-indexed-db.test-support';
import { deleteDB, openDB, type IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { inspectDatabaseAdmission } from '../admission';
import {
  DB_NAME,
  DB_VERSION,
  EDITOR_VECTOR_LIBRARY_STORE,
  EXPECTED_INDEXES,
  EXPECTED_STORES,
} from '../core.stores';
import { imageAppV54Fixture } from '../fixtures/image-app-v54';
import { imageAppV55Fixture } from '../fixtures/image-app-v55';
import { betaV69Fixture } from '../fixtures/beta-v69';
import { betaV70Fixture } from '../fixtures/beta-v70';
import { CURRENT_SCHEMA_CONTRACTS, DATABASE_MIGRATIONS } from '../schema-contracts';
import { executeDatabaseUpgrade, handleDatabaseUpgrade } from './core';

const physicalRelease = vi.hoisted(() => ({
  db: undefined as IDBPDatabase | undefined,
  ready: vi.fn(),
  remove: vi.fn(),
  read: vi.fn(),
}));

vi.mock('../core', async (original) => ({
  ...(await original<typeof import('../core')>()),
  initDB: async () => {
    if (!physicalRelease.db) throw new Error('Native release fixture is unavailable.');
    return physicalRelease.db;
  },
}));
vi.mock('../../../assets/opfs-store', async (original) => ({
  ...(await original<typeof import('../../../assets/opfs-store')>()),
  readAssetReadyClaims: physicalRelease.ready,
  deleteAssetObject: physicalRelease.remove,
  readAssetFile: physicalRelease.read,
}));
vi.mock('../../../library-lifecycle/maintenance-log', () => ({
  createMaintenanceLog: () => ({ append: async () => undefined }),
}));

const vectorRow = { key: 'retained-vector', definitionId: 'retained', bytes: [0, 255, 17] };

beforeEach(() => {
  vi.stubGlobal('navigator', {
    storage: { estimate: async () => ({ quota: 2 ** 40, usage: 0 }) },
  });
});
afterEach(async () => {
  await deleteDB(DB_NAME);
  vi.unstubAllGlobals();
});

async function createImageSource(version: 54 | 55 | 69 | 70, corrupt = false) {
  const fixture =
    version === 70
      ? betaV70Fixture
      : version === 69
        ? betaV69Fixture
        : version === 54
          ? imageAppV54Fixture
          : imageAppV55Fixture;
  const stores: readonly string[] = fixture.stores;
  const indexes = new Map<string, readonly string[]>(Object.entries(fixture.indexes));
  const db = await openDB(DB_NAME, version, {
    upgrade(database, _old, _new, transaction) {
      handleDatabaseUpgrade(database, 0, DB_VERSION, transaction);
      for (const name of [...database.objectStoreNames]) {
        if (!stores.includes(name)) {
          database.deleteObjectStore(name);
          continue;
        }
        const store = transaction.objectStore(name);
        for (const index of [...store.indexNames])
          if (!indexes.get(name)?.includes(index)) store.deleteIndex(index);
      }
      const contracts = transaction.objectStore('schema_contracts');
      void contracts.clear();
      for (const [domainId, schemaVersion] of Object.entries(fixture.domainVersions))
        void contracts.put({ domainId, schemaVersion });
      for (const [name, rows] of Object.entries(fixture.records))
        for (const row of rows) void transaction.objectStore(name).put(row);
      if (version === 55) void transaction.objectStore(EDITOR_VECTOR_LIBRARY_STORE).put(vectorRow);
      if (corrupt) void contracts.put({ domainId: 'effects', schemaVersion: 3 });
    },
  });
  db.close();
  return fixture;
}

it.each([69, 70] as const)(
  'keeps version %s data after interruption and admits the retry',
  async (version) => {
    const fixture = await createImageSource(version);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    await expect(
      openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          handleDatabaseUpgrade(db, oldVersion, newVersion, transaction);
          transaction.abort();
        },
      })
    ).rejects.toThrow();
    const retained = await openDB(DB_NAME);
    try {
      expect(retained.version).toBe(version);
      expect(await retained.get('schema_contracts', 'mediaLibrary')).toMatchObject({
        domainId: 'mediaLibrary',
        schemaVersion: fixture.domainVersions.mediaLibrary,
      });
    } finally {
      retained.close();
    }
    const updated = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      for (const [name, rows] of Object.entries(fixture.records)) {
        if (name !== 'schema_contracts') expect(await updated.getAll(name), name).toEqual(rows);
      }
      expect(await updated.get('schema_contracts', 'mediaLibrary')).toMatchObject({
        domainId: 'mediaLibrary',
        schemaVersion: 46,
      });
      expect(await updated.getAll('video_review_identities')).toEqual([]);
    } finally {
      updated.close();
    }
  }
);

it.each([54, 55] as const)(
  'admits image branch database %s and preserves all retained rows through integration',
  async (version) => {
    const fixture = await createImageSource(version);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: DB_VERSION,
      status: 'ready',
    });
    const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    try {
      expect([...db.objectStoreNames].sort()).toEqual([...EXPECTED_STORES].sort());
      for (const [name, indexes] of Object.entries(EXPECTED_INDEXES))
        expect([...db.transaction(name).store.indexNames].sort(), name).toEqual(
          [...indexes].sort()
        );
      for (const [name, rows] of Object.entries(fixture.records)) {
        if (name === 'schema_contracts' || name === EDITOR_VECTOR_LIBRARY_STORE) continue;
        expect(await db.getAll(name), name).toEqual(rows);
      }
      expect(await db.getAll(EDITOR_VECTOR_LIBRARY_STORE)).toEqual(
        version === 55 ? [vectorRow] : []
      );
      expect(await db.getAll('schema_contracts')).toEqual(
        [...CURRENT_SCHEMA_CONTRACTS].sort((a, b) => a.domainId.localeCompare(b.domainId))
      );
      await expect(inspectDatabaseAdmission()).resolves.toEqual({
        databaseVersion: DB_VERSION,
        status: 'ready',
      });
    } finally {
      db.close();
    }
  }
);

it.each([54, 55] as const)(
  'rolls back image branch database %s on interruption and accepts an unchanged retry',
  async (version) => {
    await createImageSource(version);
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({ status: 'ready' });
    await expect(
      openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion, newVersion, transaction) {
          executeDatabaseUpgrade(
            db,
            oldVersion,
            newVersion,
            transaction,
            DATABASE_MIGRATIONS.map((migration) =>
              migration.toDatabaseVersion === 61
                ? {
                    ...migration,
                    migrate(database, tx) {
                      migration.migrate(database, tx);
                      throw new Error('Interrupted image branch integration');
                    },
                  }
                : migration
            )
          );
        },
      })
    ).rejects.toThrow();
    const retained = await openDB(DB_NAME);
    expect(retained.version).toBe(version);
    expect(retained.objectStoreNames.contains('video_animation_packages')).toBe(false);
    if (version === 55)
      expect(await retained.getAll(EDITOR_VECTOR_LIBRARY_STORE)).toEqual([vectorRow]);
    retained.close();
    await expect(inspectDatabaseAdmission()).resolves.toMatchObject({ status: 'ready' });
    const retried = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
    expect(retried.version).toBe(DB_VERSION);
    if (version === 55)
      expect(await retried.getAll(EDITOR_VECTOR_LIBRARY_STORE)).toEqual([vectorRow]);
    retried.close();
  }
);

it.each([54, 55] as const)(
  'refuses mixed image and video branch contracts at database %s before mutation',
  async (version) => {
    await createImageSource(version, true);
    await expect(inspectDatabaseAdmission()).resolves.toEqual({
      databaseVersion: version,
      reason: 'domain-contracts',
      status: 'corrupt',
    });
    const preserved = await openDB(DB_NAME);
    expect(preserved.version).toBe(version);
    expect(preserved.objectStoreNames.contains('video_animation_packages')).toBe(false);
    if (version === 55)
      expect(await preserved.getAll(EDITOR_VECTOR_LIBRARY_STORE)).toEqual([vectorRow]);
    preserved.close();
  }
);

it('separates authored v69 Image and Quick Edit work from their original bytes and empty opens', async () => {
  await createImageSource(69);
  const native = await openDB(DB_NAME);
  const original = new Blob(['original pixels'], { type: 'image/png' });
  const image = createMediaLibraryEntry({
    id: 'legacy-image',
    kind: 'screenshot',
    source: { kind: 'screenshot' },
    blob: original,
    size: original.size,
    workspaceRevision: 3,
    imageContentState: 'edited',
    lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 3, trashedAt: 3 },
  });
  const workspace: StoredImageWorkspaceEntry = {
    aggregateId: image.id,
    revision: 3,
    createdAt: 1,
    updatedAt: 3,
    sourceTitle: null,
    sourceUrl: null,
    document: createPersistedEditorDocumentFixture(
      {
        ...createEditorDocumentFixture(),
        displayName: 'Retained caption',
      },
      'native-bitmap'
    ),
    history: {
      version: 1,
      epoch: 'legacy-history',
      snapshots: [{ assetId: 'undo' }, { assetId: 'redo' }],
      values: [],
      cursor: 0,
      actions: [null, { operation: 'rename', target: null }],
    },
  };
  const empty = {
    ...image,
    id: 'open-only-image',
    imageContentState: 'original' as const,
    workspaceRevision: 1,
    lifecycle: { storageClass: 'library' as const, savedAt: 1, updatedAt: 1 },
  };
  const emptyWorkspace: StoredImageWorkspaceEntry = {
    aggregateId: empty.id,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    sourceUrl: null,
    sourceTitle: null,
    document: createPersistedEditorDocumentFixture(
      {
        ...createEditorDocumentFixture(),
        frame: DEFAULT_EDITOR_FRAME_SETTINGS,
        browserFrame: DEFAULT_BROWSER_FRAME_STATE,
      },
      'initial-bitmap'
    ),
  };
  const video = createMediaLibraryEntry({
    id: 'project-asset:legacy-video',
    kind: 'video',
    mimeType: 'video/webm',
    source: { kind: 'project-asset', projectAssetId: 'legacy-video' },
    size: 6,
  });
  const opened = {
    ...video,
    id: 'project-asset:open-only-video',
    source: { kind: 'project-asset' as const, projectAssetId: 'open-only-video' },
  };
  const review = materializeVideoWorkspaceProject(
    {
      ...previousQuickEdit,
      aggregateId: video.id,
    },
    video.filename
  );
  const emptyReview = materializeVideoWorkspaceProject(
    {
      ...previousQuickEdit,
      aggregateId: opened.id,
      revision: 1,
      updatedAt: previousQuickEdit.createdAt,
      history: [],
      advanced: {
        ...previousQuickEdit.advanced,
        background: { enabled: false, zoomBehavior: 'window' },
        presentation: createNewWorkspacePresentationSettings(),
      },
    },
    opened.filename
  );
  const write = native.transaction(
    [
      'media_library',
      'image_workspaces',
      'aggregate_presentations',
      'asset_owners',
      'video_workspaces',
    ],
    'readwrite'
  );
  try {
    for (const item of [image, empty, video, opened])
      await write.objectStore('media_library').put(item);
    for (const row of [workspace, emptyWorkspace]) {
      await write.objectStore('image_workspaces').put(row);
      for (const { assetId, role } of imageWorkspaceAssetBindings(row))
        await write.objectStore('asset_owners').put({
          assetId,
          ownerKind: 'image-workspace',
          ownerId: row.aggregateId,
          role,
        });
    }
    await write.objectStore('aggregate_presentations').put({
      aggregateId: image.id,
      aggregateKind: 'image',
      presentationRevision: workspace.revision,
      updatedAt: 3,
      thumbnailBlob: new Blob(['saved preview'], { type: 'image/png' }),
    });
    for (const row of [review, emptyReview]) await write.objectStore('video_workspaces').put(row);
    await write.done;
  } finally {
    native.close();
  }

  await expect(inspectDatabaseAdmission()).resolves.toMatchObject({ status: 'ready' });
  const projectId = legacyImageProjectId(image.id);
  const nativePut = IDBObjectStore.prototype.put;
  let movedProjectWasWritten = false;
  const fault = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey
  ) {
    const request = nativePut.call(this, value, key);
    if (
      this.name === 'image_workspaces' &&
      (value as StoredImageWorkspaceEntry).aggregateId === projectId
    ) {
      request.addEventListener(
        'success',
        () => {
          movedProjectWasWritten = true;
          this.transaction.abort();
        },
        { once: true }
      );
    }
    return request;
  });
  try {
    await expect(
      openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(movedProjectWasWritten).toBe(true);
  } finally {
    fault.mockRestore();
  }
  const rolledBack = await openDB(DB_NAME);
  try {
    expect(rolledBack.version).toBe(69);
    expect(await rolledBack.get('image_workspaces', image.id)).toEqual(workspace);
    expect(await rolledBack.get('image_workspaces', projectId)).toBeUndefined();
    const restoredOriginal = await rolledBack.get('media_library', image.id);
    expect(restoredOriginal).toMatchObject({ imageContentState: 'edited', workspaceRevision: 3 });
    expect(await restoredOriginal.blob.text()).toBe('original pixels');
    expect(
      await rolledBack.get('asset_owners', ['image-workspace', projectId, 'source-image'])
    ).toBeUndefined();
    expect(await rolledBack.get('aggregate_presentations', ['image', image.id])).toMatchObject({
      presentationRevision: workspace.revision,
    });
  } finally {
    rolledBack.close();
  }
  await expect(inspectDatabaseAdmission()).resolves.toMatchObject({ status: 'ready' });
  const upgraded = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  try {
    const migrated = await upgraded.get('image_workspaces', projectId);
    expect(migrated).toMatchObject({
      aggregateId: projectId,
      sourceMediaId: image.id,
      document: workspace.document,
      history: workspace.history,
      lifecycle: image.lifecycle,
    });
    expect(await upgraded.get('image_workspaces', image.id)).toBeUndefined();
    const source = await upgraded.get('media_library', image.id);
    expect(source).toMatchObject({ imageContentState: 'original', workspaceRevision: 0 });
    expect(await source.blob.text()).toBe('original pixels');
    expect(await upgraded.get('media_library', projectId)).toBeUndefined();
    expect(await upgraded.get('aggregate_presentations', ['image', projectId])).toMatchObject({
      presentationRevision: workspace.revision,
    });
    for (const { assetId, role } of imageWorkspaceAssetBindings(workspace)) {
      expect(
        await upgraded.get('asset_owners', ['image-workspace', image.id, role])
      ).toBeUndefined();
      expect(
        await upgraded.get('asset_owners', ['image-workspace', projectId, role])
      ).toMatchObject({ assetId });
    }
    expect(await upgraded.get('image_workspaces', empty.id)).toBeUndefined();
    expect(await upgraded.get('image_workspaces', legacyImageProjectId(empty.id))).toBeUndefined();
    expect(await upgraded.get('media_library', empty.id)).toMatchObject({
      imageContentState: 'original',
    });

    const quickEditId = legacyQuickEditProjectId(video);
    const [head, rows] = await Promise.all([
      upgraded.get('video_workspaces', quickEditId),
      upgraded.getAllFromIndex('video_workspace_history', 'aggregateId', quickEditId),
    ]);
    expect(materializeWorkspaceStorage(head, rows)).toMatchObject({
      aggregateId: quickEditId,
      sourceMediaId: video.id,
      sourceAssetId: review.sourceAssetId,
      history: review.history,
      cursor: review.cursor,
      project: review.project,
    });
    expect(await upgraded.get('video_workspaces', video.id)).toBeUndefined();
    expect(await upgraded.get('video_workspaces', opened.id)).toBeUndefined();
    expect(
      await upgraded.get('video_workspaces', legacyQuickEditProjectId(opened))
    ).toBeUndefined();
  } finally {
    upgraded.close();
  }
});

it('keeps exact legacy rows when native or enrolled evidence prevents conversion', async () => {
  await createImageSource(69);
  const native = await openDB(DB_NAME);
  const tx = native.transaction(
    [
      'media_library',
      'image_workspaces',
      'aggregate_presentations',
      'sync_capture',
      'asset_owners',
    ],
    'readwrite'
  );
  const longId = 'i'.repeat(257);
  const ids = ['orphan', 'revision-mismatch', 'invalid-preview', 'enrolled', 'checkpoint', longId];
  const workspaces = ids.map((id) => ({
    aggregateId: id,
    revision: 3,
    createdAt: 1,
    updatedAt: 3,
    sourceUrl: null,
    sourceTitle: null,
    document: createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'old-bitmap'),
  }));
  const captureSpace = 'legacy-enrollment';
  const captureRows = [
    { key: 'profile', kind: 'profile', spaceId: captureSpace },
    { key: JSON.stringify(['root-state', JSON.stringify([captureSpace, 'media', 'enrolled'])]) },
    {
      key: JSON.stringify([
        'pending-checkpoint',
        JSON.stringify([captureSpace, 'media', 'checkpoint']),
      ]),
    },
  ];
  try {
    for (const row of workspaces) {
      await tx.objectStore('image_workspaces').put(row);
      if (row.aggregateId === 'orphan') continue;
      for (const { assetId, role } of imageWorkspaceAssetBindings(row))
        await tx.objectStore('asset_owners').put({
          assetId,
          role,
          ownerId: row.aggregateId,
          ownerKind: 'image-workspace',
        });
      await tx.objectStore('media_library').put(
        createMediaLibraryEntry({
          id: row.aggregateId,
          kind: 'screenshot',
          source: { kind: 'screenshot' },
          workspaceRevision: row.aggregateId === 'revision-mismatch' ? 2 : 3,
          imageContentState: 'edited',
        })
      );
    }
    await tx.objectStore('aggregate_presentations').put({
      aggregateId: 'invalid-preview',
      aggregateKind: 'image',
      presentationRevision: 3,
    });
    for (const row of captureRows) await tx.objectStore('sync_capture').put(row);
    await tx.done;
  } finally {
    native.close();
  }
  await expect(inspectDatabaseAdmission()).resolves.toMatchObject({ status: 'ready' });
  const upgraded = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  try {
    for (const row of workspaces) {
      expect(await upgraded.get('image_workspaces', row.aggregateId)).toEqual(row);
      expect(
        await upgraded.get('image_workspaces', legacyImageProjectId(row.aggregateId))
      ).toBeUndefined();
    }
    for (const row of captureRows) expect(await upgraded.get('sync_capture', row.key)).toEqual(row);
  } finally {
    upgraded.close();
  }
});

it('releases discarded Image bytes after ready claims clear and retains a shared original', async () => {
  await createImageSource(69);
  const old = await openDB(DB_NAME);
  const keys = ['only-for-legacy-open', 'shared-original-bitmap', 'metadata-only-original-bitmap'];
  const files = new Map(keys.map((id) => [id, new Blob(['pixels'], { type: 'image/png' })]));
  const put = withIndexedRowProjections(old).transaction(
    ['media_library', 'image_workspaces', 'asset_refs', 'asset_owners'],
    'readwrite'
  );
  try {
    for (const assetId of keys) {
      const itemId = `media-${assetId}`;
      const asset = files.get(assetId)!;
      const media = createMediaLibraryEntry({
        id: itemId,
        filename: 'capture.png',
        kind: 'screenshot',
        source: { kind: 'screenshot' },
        blob: asset,
        size: asset.size,
        mimeType: asset.type,
        imageContentState: 'original',
        workspaceRevision: 1,
      });
      await put.objectStore('media_library').put(media);
      await put.objectStore('asset_refs').put({
        assetId,
        createdAt: 1,
        mimeType: asset.type,
        size: asset.size,
        sha256: null,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
      });
      await put.objectStore('image_workspaces').put({
        aggregateId: itemId,
        document: createPersistedEditorDocumentFixture(
          {
            ...createEditorDocumentFixture(),
            frame: DEFAULT_EDITOR_FRAME_SETTINGS,
            browserFrame: DEFAULT_BROWSER_FRAME_STATE,
          },
          assetId
        ),
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        sourceTitle: null,
        sourceUrl: null,
      });
      await put.objectStore('asset_owners').put({
        assetId,
        ownerKind: 'image-workspace',
        ownerId: itemId,
        role: 'source-image',
      });
      if (assetId === keys[0]) continue;
      const { blob: _inline, ...metadata } = media;
      await put.objectStore('media_library').put({
        ...metadata,
        id: assetId === keys[1] ? 'saved-original' : 'original-without-owner',
        workspaceRevision: 0,
        source: { kind: 'stored-asset', assetId },
      });
      if (assetId !== keys[1]) continue;
      await put.objectStore('asset_owners').put({
        assetId,
        ownerKind: 'media-library',
        ownerId: 'saved-original',
        role: 'source',
      });
    }
    await put.done;
  } finally {
    old.close();
  }

  const upgraded = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  physicalRelease.db = withIndexedRowProjections(upgraded);
  physicalRelease.remove.mockImplementation(async (id: string) => {
    files.delete(id);
  });
  physicalRelease.read.mockImplementation(async (ref: AssetRef, filename: string) => {
    const file = files.get(ref.assetId);
    if (!file) throw new Error('Retained original bytes are missing.');
    return new File([file], filename, { type: file.type });
  });
  try {
    expect(await upgraded.get('asset_refs', keys[0]!)).toBeUndefined();
    expect(await upgraded.get('asset_refs', keys[1]!)).toMatchObject({ assetId: keys[1] });
    const operations = await upgraded.getAll('asset_operations');
    const intent = operations
      .map(parsePhysicalDeleteAssetOperation)
      .find((record) => record?.assetIds.includes(keys[0]!));
    expect(intent?.assetIds).toEqual([keys[0]]);
    if (!intent) throw new Error('Discarded bytes lack a durable release operation.');
    physicalRelease.ready.mockResolvedValueOnce({
      valid: true,
      journals: [],
      assetIds: new Set([keys[0]]),
    });
    await completePhysicalDeleteOperation(intent);
    expect(files.has(keys[0]!)).toBe(true);
    expect(await upgraded.get('asset_operations', intent.operationId)).toBeDefined();

    physicalRelease.ready.mockResolvedValueOnce({ valid: true, journals: [], assetIds: new Set() });
    await completePhysicalDeleteOperation(intent);
    expect(files.has(keys[0]!)).toBe(false);
    expect(files.has(keys[1]!)).toBe(true);
    expect(await upgraded.get('asset_refs', keys[2]!)).toMatchObject({ assetId: keys[2] });
    const { blob } = await readImageOriginalSource('original-without-owner');
    expect(await blob?.text()).toBe('pixels');
    expect(await upgraded.get('asset_operations', intent.operationId)).toBeUndefined();
    const original = await upgraded.get('media_library', `media-${keys[0]}`);
    expect(await original?.blob.text()).toBe('pixels');
  } finally {
    physicalRelease.db = undefined;
    upgraded.close();
  }
});
