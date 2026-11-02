import { createRetentionDatabaseFixture } from './retention-authority.test-support';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
} from '../projects/index.storage.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../document-assets/test-support';
import { createPagePackageManifestFixture } from '../../../features/web-snapshot/manifest.test-support';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { collectDurableAssetSnapshot } from './retention-authority';
const mocks = vi.hoisted(() => ({ db: vi.fn(), debug: vi.fn() }));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ debug: mocks.debug }),
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (operation: (db: unknown) => Promise<unknown>) =>
    operation({ getAllFromIndex: async () => [], ...(await mocks.db()) }),
}));

beforeEach(() => {
  vi.stubGlobal('IDBKeyRange', { lowerBound: (lower: unknown) => ({ lower }) });
});
afterEach(() => vi.unstubAllGlobals());

function installDatabase(database: { getAll: (store: string) => Promise<unknown[]> }) {
  const fixture = createRetentionDatabaseFixture(database.getAll);
  mocks.db.mockResolvedValue(fixture);
  return fixture;
}

it('finishes retention validation without waiting for background-tab timers', async () => {
  const yieldTask = vi.fn(async () => undefined);
  vi.stubGlobal('scheduler', { yield: yieldTask });
  const timer = vi.spyOn(globalThis, 'setTimeout');
  installDatabase({
    getAll: async (store: string) =>
      store === 'recordings'
        ? Array.from({ length: 17 }, (_, index) => ({
            id: `recording-${index}`,
            assetId: `asset-${index}`,
            createdAt: 1,
            filename: 'recording.webm',
            mimeType: 'video/webm',
            size: 1,
          }))
        : [],
  });
  try {
    const snapshot = await collectDurableAssetSnapshot();
    expect(snapshot.authorityValid).toBe(true);
    expect(snapshot.expectedOwners).toHaveLength(17);
    expect(yieldTask).not.toHaveBeenCalled();
    expect(timer).not.toHaveBeenCalled();
  } finally {
    timer.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('validates bounded pages and returns only their retention projection', async () => {
  const getAll = vi.fn(async (store: string) =>
    store === 'recordings'
      ? Array.from({ length: 1000 }, (_, i) => ({
          id: `recording-${i}`,
          assetId: `asset-${i}`,
          createdAt: 1,
          filename: 'recording.webm',
          mimeType: 'video/webm',
          size: 1,
        }))
      : []
  );
  const fixture = installDatabase({ getAll });
  {
    const snapshot = await collectDurableAssetSnapshot();
    expect(snapshot.authorityValid).toBe(true);
    expect(snapshot.expectedOwners).toHaveLength(1000);
    expect(getAll).toHaveBeenCalledTimes(15);
    expect(
      fixture.pages.mock.calls.filter(([store, , , keys]) => store === 'recordings' && !keys)
    ).toHaveLength(16);
    expect(snapshot).not.toHaveProperty('recordings');
  }
});

it('reports the fixed invalid store while retaining fail-closed deletion authority', async () => {
  mocks.debug.mockClear();
  installDatabase({
    getAll: async (store: string) =>
      store === 'recordings' ? [{ id: 'private-recording-id' }] : [],
  });
  const snapshot = await collectDurableAssetSnapshot();
  expect(snapshot.authorityValid).toBe(false);
  expect(mocks.debug).toHaveBeenCalledWith('Retention validation failed: recordings');
  expect(JSON.stringify(mocks.debug.mock.calls)).not.toContain('private-recording-id');
});

it('projects published project source identities independently of Library card naming', async () => {
  const media = createMediaLibraryEntry({
    id: 'independent-card',
    source: { kind: 'project-asset', projectAssetId: 'shared-source' },
  });
  installDatabase({
    getAll: async (store: string) => (store === 'media_library' ? [media] : []),
  });
  const snapshot = await collectDurableAssetSnapshot();
  expect(snapshot.authorityValid).toBe(true);
  expect([...snapshot.publishedProjectAssetIds]).toEqual(['shared-source']);
});

it.each(['asset_refs', 'asset_owners', 'asset_operations'])(
  'reports invalid %s without exposing the rejected row',
  async (invalidStore) => {
    mocks.debug.mockClear();
    installDatabase({
      getAll: async (store: string) =>
        store === invalidStore ? [{ privateValue: 'never report' }] : [],
    });
    const snapshot = await collectDurableAssetSnapshot();
    expect(snapshot.authorityValid).toBe(false);
    expect(mocks.debug).toHaveBeenCalledWith(`Retention validation failed: ${invalidStore}`);
    expect(JSON.stringify(mocks.debug.mock.calls)).not.toContain('never report');
  }
);

it('projects all durable source kinds and preserves unfinished restore claims', async () => {
  const document = createPersistedEditorDocumentFixture(
    createEditorDocumentFixture(),
    'canvas-source'
  );
  const stores: Record<string, unknown[]> = {
    project_assets: [createProjectAssetEntry()],
    project_exports: [createProjectExportEntry()],
    scenario_assets: [
      {
        id: 'child',
        projectId: 'scenario',
        assetId: 'child-bytes',
        galleryAssetId: null,
        mimeType: 'image/png',
        width: 10,
        height: 10,
        createdAt: 1,
        size: 10,
      },
    ],
    scenario_exports: [
      {
        id: 'html',
        projectId: 'scenario',
        format: 'html',
        filename: 'guide.html',
        createdAt: 1,
        size: 10,
        html: { mode: 'guide', assetId: 'html-bytes' },
      },
      {
        id: 'legacy',
        projectId: 'scenario',
        format: 'pdf',
        filename: 'guide.pdf',
        createdAt: 1,
        size: 0,
      },
    ],
    image_workspaces: [
      {
        aggregateId: 'image',
        createdAt: 1,
        updatedAt: 1,
        revision: 1,
        sourceTitle: null,
        sourceUrl: null,
        document,
        legacy: [
          new Blob(['legacy']),
          'blob:legacy',
          'data:image/png;base64,legacy',
          7,
          null,
          { safe: 'plain' },
        ],
      },
    ],
    scenario_step_editor_documents: [
      { projectId: 'scenario', stepId: 'step', document, createdAt: 1, updatedAt: 1 },
    ],
    web_snapshots: [
      {
        id: 'web',
        createdAt: 1,
        updatedAt: 1,
        manifest: createPagePackageManifestFixture(),
        packageAssetId: 'package',
        screenshotAssetId: 'screenshot',
        screenshotMimeType: 'image/png',
        screenshotSize: 3,
        size: 3,
      },
    ],
    media_library: [
      createMediaLibraryEntry(),
      createMediaLibraryEntry({
        id: 'direct',
        source: { kind: 'stored-asset', assetId: 'direct-bytes' },
      }),
    ],
    asset_operations: [
      {
        compensations: [],
        createdAt: 1,
        kind: 'backup-restore',
        obsoleteAssetIds: ['rollback'],
        operationId: 'restore',
        status: 'pending',
        updatedAt: 2,
      },
      {
        assetIds: ['delete'],
        createdAt: 1,
        kind: 'physical-delete',
        operationId: 'delete-operation',
        status: 'pending',
        updatedAt: 2,
      },
      {
        archiveFingerprint: 'a'.repeat(64),
        childIdMap: {},
        committedRoots: [],
        conflictedRoots: [],
        createdAt: 1,
        currentRoot: null,
        kind: 'archive-restore-session',
        operationId: 'session',
        rootIdMap: {},
        skippedRoots: [],
        status: 'pending',
        strategy: 'duplicate',
        updatedAt: 2,
      },
    ],
  };
  installDatabase({ getAll: async (store: string) => stores[store] ?? [] });
  const snapshot = await collectDurableAssetSnapshot();
  expect(snapshot.authorityValid).toBe(true);
  expect(snapshot.expectedOwners.map((entry) => entry.ownerKind)).toEqual([
    'project-asset',
    'project-export',
    'scenario-asset',
    'scenario-export',
    'image-workspace',
    'scenario-editor-document',
    'web-snapshot',
    'web-snapshot',
    'media-library',
  ]);
  expect(snapshot.protectedRollbackAssetIds).toEqual(new Set(['rollback']));
  expect(snapshot.operationIds).toEqual(new Set(['restore', 'session']));
  expect(snapshot.embeddedBinaryMetadata).toEqual([
    'image-workspace[0].legacy[0]',
    'image-workspace[0].legacy[1]',
    'image-workspace[0].legacy[2]',
  ]);
});

it('cancels before opening source stores', async () => {
  const getAll = vi.fn();
  installDatabase({ getAll });
  const abort = new AbortController();
  abort.abort();
  await expect(collectDurableAssetSnapshot(undefined, abort.signal)).rejects.toThrow();
  expect(getAll).not.toHaveBeenCalled();
});

it('projects snapshot ownership from compact heads without reading event history', async () => {
  const head = {
    recordingId: 'recording-one',
    trajectoryId: 'a'.repeat(32),
    sourceRecordingId: 'canonical',
    writerGeneration: 'generation-one',
    revision: 1,
    width: 160,
    height: 90,
    retired: false,
    finalized: true,
    state: 'complete',
    totalBlocks: 1,
    totalRecords: 3,
    totalSamples: 1,
    totalBytes: 512,
    streamSha256: 'b'.repeat(64),
    activeSegment: null,
    lastObservationSeq: 0,
    lastSegmentId: 0,
    lastTimeUs: 2000,
    snapshotAssetId: 'cursor-file',
  };
  const getAll = vi.fn(async (store: string) =>
    store === 'recording_cursor_trajectories' ? [head] : []
  );
  installDatabase({ getAll });
  const snapshot = await collectDurableAssetSnapshot();
  expect(snapshot.authorityValid).toBe(true);
  expect(snapshot.expectedOwners).toEqual([
    {
      ownerKind: 'recording',
      ownerId: head.recordingId,
      role: 'cursor-trajectory',
      assetId: head.snapshotAssetId,
    },
  ]);
  expect(getAll).not.toHaveBeenCalledWith('recording_telemetry');
  head.retired = true;
  expect((await collectDurableAssetSnapshot()).expectedOwners).toEqual([]);
  head.retired = false;
  head.snapshotAssetId = '';
  expect((await collectDurableAssetSnapshot()).authorityValid).toBe(false);
});

it('projects event snapshot ownership from the head index without reading mixed history rows', async () => {
  const head = {
    recordingId: 'event-recording',
    eventStreamId: 'b'.repeat(32),
    sourceRecordingId: 'canonical',
    writerGeneration: 'source-generation',
    kind: 'head',
    entryId: 0,
    revision: 1,
    retired: false,
    finalized: true,
    state: 'incomplete',
    totalBlocks: 1,
    totalRecords: 3,
    totalBytes: 512,
    streamSha256: 'd'.repeat(64),
    activeSegment: null,
    lastSegmentId: 0,
    hasGap: true,
    activeInputs: 0,
    snapshotAssetId: 'events-file',
  };
  const getAll = vi.fn(async () => []);
  const getAllFromIndex = vi.fn(async () => [head]);
  mocks.db.mockResolvedValue({ ...createRetentionDatabaseFixture(getAll), getAllFromIndex });
  const snapshot = await collectDurableAssetSnapshot();
  expect(snapshot.authorityValid).toBe(true);
  expect(snapshot.expectedOwners).toEqual([
    {
      ownerKind: 'recording',
      ownerId: head.recordingId,
      role: 'recording-events',
      assetId: head.snapshotAssetId,
    },
  ]);
  expect(getAllFromIndex).toHaveBeenCalledWith('recording_events', 'kind', 'head');
  expect(getAll).not.toHaveBeenCalledWith('recording_events');
  head.retired = true;
  expect((await collectDurableAssetSnapshot()).expectedOwners).toEqual([]);
  head.retired = false;
  head.snapshotAssetId = '';
  expect((await collectDurableAssetSnapshot()).authorityValid).toBe(false);
});
it('bounds raw source reads while preserving every owner across page boundaries', async () => {
  const rows = Array.from({ length: 129 }, (_, index) => ({
    id: `recording-${index}`,
    assetId: `asset-${index}`,
    createdAt: 1,
    filename: 'recording.webm',
    mimeType: 'video/webm',
    size: 1,
  }));
  const getAll = vi.fn(async (store: string) => (store === 'recordings' ? rows : []));
  const fixture = installDatabase({ getAll });
  const snapshot = await collectDurableAssetSnapshot();
  expect(snapshot.authorityValid).toBe(true);
  expect(snapshot.expectedOwners).toHaveLength(129);
  expect(fixture.getAll).not.toHaveBeenCalled();
  expect(fixture.pages.mock.calls.every(([, , count]) => count === 64)).toBe(true);
});

it.each(['asset_refs', 'asset_owners', 'asset_operations', 'sync_capture'])(
  'visits every bounded page of %s and retains invalid authority',
  async (source) => {
    const fixture = installDatabase({
      getAll: async (store) => (store === source ? Array.from({ length: 129 }, () => ({})) : []),
    });
    const snapshot = await collectDurableAssetSnapshot();
    expect(snapshot.authorityValid).toBe(false);
    expect(fixture.getAll).not.toHaveBeenCalled();
    expect(
      fixture.pages.mock.calls.filter(([store, , , keys]) => store === source && !keys)
    ).toHaveLength(3);
  }
);

it('keeps embedded diagnostics ordinals across invalid rows and page boundaries', async () => {
  installDatabase({
    getAll: async (store) =>
      store === 'image_workspaces'
        ? [...Array.from({ length: 65 }, () => ({})), { legacy: ['blob:private'] }]
        : [],
  });
  const snapshot = await collectDurableAssetSnapshot();
  expect(snapshot.authorityValid).toBe(false);
  expect(snapshot.embeddedBinaryMetadata).toEqual(['image-workspace[65].legacy[0]']);
});

it.each(['abort', 'read-error'])(
  'discards an incomplete snapshot after %s and permits a fresh retry',
  async (failure) => {
    const rows = Array.from({ length: 129 }, (_, index) => ({
      id: `recording-${index}`,
      assetId: `asset-${index}`,
      createdAt: 1,
      filename: 'recording.webm',
      mimeType: 'video/webm',
      size: 1,
    }));
    const fixture = installDatabase({
      getAll: async (store) => (store === 'recordings' ? rows : []),
    });
    const abort = new AbortController();
    fixture.pages.mockImplementation((store, range) => {
      if (store !== 'recordings' || range === undefined) return;
      if (failure === 'abort') abort.abort();
      else throw new Error('Read failed');
    });
    await expect(collectDurableAssetSnapshot(undefined, abort.signal)).rejects.toThrow(
      failure === 'read-error' ? 'Read failed' : undefined
    );
    expect(fixture.abort).toHaveBeenCalledOnce();
    expect(fixture.transaction.mock.calls.some(([names]) => names.includes('media_library'))).toBe(
      false
    );
    fixture.pages.mockReset();
    rows[128] = { ...rows[128]!, assetId: 'replacement' };
    const snapshot = await collectDurableAssetSnapshot();
    expect(snapshot.authorityValid).toBe(true);
    expect(snapshot.expectedOwners).toHaveLength(129);
    expect(snapshot.expectedOwners.at(-1)?.assetId).toBe('replacement');
  }
);

it('keeps a store snapshot when a writer replaces and recreates rows between pages', async () => {
  const rows = Array.from({ length: 129 }, (_, index) => ({
    id: `recording-${index}`,
    assetId: `asset-${index}`,
    createdAt: 1,
    filename: 'recording.webm',
    mimeType: 'video/webm',
    size: 1,
  }));
  const fixture = installDatabase({
    getAll: async (store) => (store === 'recordings' ? rows : []),
  });
  fixture.pages.mockImplementation((store, range) => {
    if (store !== 'recordings' || range === undefined) return;
    rows[0] = { ...rows[0]!, assetId: 'recreated' };
    rows[128] = { ...rows[128]!, assetId: 'delayed-new-claim' };
  });
  const first = await collectDurableAssetSnapshot();
  expect(first.expectedOwners[0]?.assetId).toBe('asset-0');
  expect(first.expectedOwners.at(-1)?.assetId).toBe('asset-128');
  fixture.pages.mockReset();
  const next = await collectDurableAssetSnapshot();
  expect(next.expectedOwners[0]?.assetId).toBe('recreated');
  expect(next.expectedOwners.at(-1)?.assetId).toBe('delayed-new-claim');
});

it.each(['pending', 'aborted', 'committed'])(
  'projects %s compensation claims across pages without returning rollback payloads',
  async (status) => {
    const operations = Array.from({ length: 129 }, (_, index) => ({
      compensations: [
        {
          assetId: `next-${index}`,
          journalId: 'journal',
          nextMediaId: 'media',
          nextOwnerId: 'owner',
          previousRecords: {
            assetRefEntry: { assetId: `previous-${index}` },
            assetOwnerEntries: [{ assetId: `owner-${index}` }],
            document: { payload: 'x'.repeat(2048) },
          },
        },
      ],
      createdAt: 1,
      kind: 'backup-restore',
      obsoleteAssetIds: [`obsolete-${index}`],
      operationId: `operation-${index}`,
      status,
      updatedAt: 2,
    }));
    installDatabase({ getAll: async (store) => (store === 'asset_operations' ? operations : []) });
    const snapshot = await collectDurableAssetSnapshot();
    expect(snapshot.authorityValid).toBe(true);
    expect([...snapshot.operationIds]).toEqual(
      operations.map((operation) => operation.operationId)
    );
    expect(snapshot.protectedRollbackAssetIds).toEqual(
      new Set(
        status === 'committed'
          ? []
          : operations.flatMap((_, index) => [
              `obsolete-${index}`,
              `next-${index}`,
              `previous-${index}`,
              `owner-${index}`,
            ])
      )
    );
    expect(snapshot).not.toHaveProperty('backupOperations');
  }
);
