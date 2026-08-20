import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  journals: vi.fn(),
  objectLock: vi.fn(),
  objects: vi.fn(),
  runMutation: vi.fn(),
  writing: vi.fn(),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  deleteAssetObject: mocks.deleteObject,
  listAssetObjectIds: mocks.objects,
  listReadyJournals: mocks.journals,
  listWritingAssetIds: mocks.writing,
  runWithAssetObjectLockIfAvailable: mocks.objectLock,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { auditDurableAssets, collectOrphanAssetObjects } from './audit';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.objectLock.mockImplementation(async (_assetId, effect) => effect());
  mocks.journals.mockResolvedValue([]);
  mocks.objects.mockResolvedValue(['asset-live', 'orphan', 'ready', 'writing']);
  mocks.writing.mockResolvedValue(['writing']);
  mocks.journals.mockResolvedValue([
    {
      assetRefs: [createRef('ready')],
      createdAt: 1,
      domain: 'recording-assets',
      journalId: 'journal-ready',
      payload: {},
    },
  ]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: async (store: string) => {
        if (store === 'asset_refs') return [createRef('asset-live'), createRef('asset-missing')];
        if (store === 'asset_owners') {
          return [
            { assetId: 'asset-live', ownerId: 'recording-1', ownerKind: 'recording', role: 'body' },
            {
              assetId: 'asset-missing',
              ownerId: 'recording-2',
              ownerKind: 'recording',
              role: 'body',
            },
            { assetId: 'no-ref', ownerId: 'recording-3', ownerKind: 'recording', role: 'body' },
          ];
        }
        if (store === 'recordings') {
          return [
            createRecording('recording-1', 'asset-live'),
            createRecording('recording-2', 'different-asset'),
          ];
        }
        return [];
      },
    })
  );
});

it('reports cross-domain authority drift while protecting ready and active-writing objects', async () => {
  await expect(auditDurableAssets()).resolves.toMatchObject({
    objectsWithoutAuthority: ['orphan'],
    ownersWithoutRefs: [expect.objectContaining({ assetId: 'no-ref' })],
    ownerMetadataMismatches: expect.arrayContaining([
      expect.objectContaining({ assetId: 'asset-missing' }),
      expect.objectContaining({ assetId: 'no-ref' }),
      expect.objectContaining({ assetId: 'different-asset' }),
    ]),
    refsWithoutObjects: [expect.objectContaining({ assetId: 'asset-missing' })],
  });
});

it.each([
  ['recordings', createRecording('recording-owner-missing', 'asset-domain')],
  ['project_assets', createProjectAsset('project-owner-missing', 'asset-domain')],
  ['project_exports', createProjectExport('export-owner-missing', 'asset-domain')],
  ['scenario_assets', createScenarioAsset('scenario-owner-missing', 'asset-domain')],
])('reports a required %s owner missing from an otherwise referenced asset', async (store, row) => {
  mocks.objects.mockResolvedValue(['asset-domain']);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: async (requestedStore: string) => {
        if (requestedStore === 'asset_refs') return [createRef('asset-domain')];
        if (requestedStore === store) return [row];
        return [];
      },
    })
  );

  const report = await auditDurableAssets();

  expect(report.ownerMetadataMismatches).toEqual([
    expect.objectContaining({ assetId: 'asset-domain', role: 'body' }),
  ]);
});

it('reports every domain owner when two domain rows share one immutable asset', async () => {
  mocks.objects.mockResolvedValue(['asset-shared']);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: async (store: string) => {
        if (store === 'asset_refs') return [createRef('asset-shared')];
        if (store === 'asset_owners') {
          return [
            {
              assetId: 'asset-shared',
              ownerId: 'project-shared',
              ownerKind: 'project-asset',
              role: 'body',
            },
          ];
        }
        if (store === 'recordings') return [createRecording('recording-shared', 'asset-shared')];
        if (store === 'project_assets')
          return [createProjectAsset('project-shared', 'asset-shared')];
        return [];
      },
    })
  );

  const report = await auditDurableAssets();

  expect(report.ownerMetadataMismatches).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ownerId: 'recording-shared', ownerKind: 'recording' }),
      expect.objectContaining({ ownerId: 'project-shared', ownerKind: 'project-asset' }),
    ])
  );
});

it('deletes only objects with no ref, ready journal, or writing marker', async () => {
  await collectOrphanAssetObjects();

  expect(mocks.deleteObject).toHaveBeenCalledOnce();
  expect(mocks.deleteObject).toHaveBeenCalledWith('orphan');
});

it('revalidates IDB authority after acquiring the object lock', async () => {
  let snapshotCount = 0;
  mocks.objects.mockResolvedValue(['published-during-collection']);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.runMutation.mockImplementation(async (effect) => {
    snapshotCount += 1;
    return effect({
      getAll: async (store: string) => {
        if (store === 'asset_refs' && snapshotCount > 1)
          return [createRef('published-during-collection')];
        return [];
      },
    });
  });

  await collectOrphanAssetObjects();

  expect(mocks.objectLock).toHaveBeenCalledWith(
    'published-during-collection',
    expect.any(Function)
  );
  expect(mocks.deleteObject).not.toHaveBeenCalled();
});

it('protects rollback bytes recorded by a replace operation during collector revalidation', async () => {
  let snapshotCount = 0;
  mocks.objects.mockResolvedValue(['rollback-object']);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.runMutation.mockImplementation(async (effect) => {
    snapshotCount += 1;
    return effect({
      getAll: async (store: string) => {
        if (store === 'asset_operations' && snapshotCount > 1) {
          return [
            {
              compensations: [],
              createdAt: 1,
              kind: 'backup-restore',
              obsoleteAssetIds: ['rollback-object'],
              operationId: 'replace-operation',
              status: 'pending',
              updatedAt: 1,
            },
          ];
        }
        return [];
      },
    });
  });

  await collectOrphanAssetObjects();

  expect(mocks.objectLock).toHaveBeenCalledWith('rollback-object', expect.any(Function));
  expect(mocks.deleteObject).not.toHaveBeenCalled();
});

it('fails closed when persisted asset authority cannot be parsed', async () => {
  mocks.objects.mockResolvedValue(['unknown-object']);
  mocks.journals.mockResolvedValue([]);
  mocks.writing.mockResolvedValue([]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: async (store: string) => (store === 'asset_refs' ? [{ invalid: true }] : []),
    })
  );

  await expect(collectOrphanAssetObjects()).resolves.toMatchObject({ authorityValid: false });
  expect(mocks.objectLock).not.toHaveBeenCalled();
  expect(mocks.deleteObject).not.toHaveBeenCalled();
});

function createRef(assetId: string) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType: 'video/webm',
    sha256: null,
    size: 3,
  };
}

function createRecording(id: string, assetId: string) {
  return {
    assetId,
    createdAt: 1,
    filename: `${id}.webm`,
    id,
    mimeType: 'video/webm',
    size: 3,
  };
}

function createProjectAsset(id: string, assetId: string) {
  return {
    assetId,
    createdAt: 1,
    id,
    mimeType: 'video/webm',
    size: 3,
  };
}

function createProjectExport(id: string, assetId: string) {
  return {
    assetId,
    createdAt: 1,
    duration: 1,
    filename: `${id}.webm`,
    fps: 30,
    height: 100,
    id,
    mimeType: 'video/webm',
    projectId: 'project-1',
    size: 3,
    width: 100,
  };
}

function createScenarioAsset(id: string, assetId: string) {
  return {
    assetId,
    createdAt: 1,
    galleryAssetId: null,
    height: 1,
    id,
    mimeType: 'image/png',
    projectId: 'scenario-project',
    size: 3,
    width: 1,
  };
}
