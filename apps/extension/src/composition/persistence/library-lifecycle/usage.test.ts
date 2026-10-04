import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMediaThumbnail: vi.fn(),
  listAggregatePresentations: vi.fn(),
  recoverAndListStoredImageWorkspaces: vi.fn(),
  listStoredImageWorkspaces: vi.fn(),
  listMediaLibrary: vi.fn(),
  listScenarioAssets: vi.fn(),
  listScenarioExports: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
  listStoredScenarioStepEditorDocuments: vi.fn(),
  listVideoProjectEntries: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../aggregate-presentations')>()),
  listAggregatePresentations: mocks.listAggregatePresentations,
}));
vi.mock('../image-workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image-workspaces')>()),
  recoverAndListStoredImageWorkspaces: mocks.recoverAndListStoredImageWorkspaces,
  listStoredImageWorkspaces: mocks.listStoredImageWorkspaces,
}));
vi.mock('../media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library')>()),
  getMediaThumbnail: mocks.getMediaThumbnail,
  listMediaLibrary: mocks.listMediaLibrary,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: mocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioAssets: mocks.listScenarioAssets,
  listScenarioExports: mocks.listScenarioExports,
  listScenarioProjectEntries: mocks.listScenarioProjectEntries,
}));
vi.mock('../scenario/editor-documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/editor-documents')>()),
  listStoredScenarioStepEditorDocuments: mocks.listStoredScenarioStepEditorDocuments,
}));
vi.mock('../infrastructure/indexed-db/mutation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/mutation')>()),
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { getLibraryStorageUsage } from './usage';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAggregatePresentations.mockResolvedValue([]);
  mocks.getMediaThumbnail.mockResolvedValue(undefined);
  mocks.recoverAndListStoredImageWorkspaces.mockResolvedValue([]);
  mocks.listStoredImageWorkspaces.mockResolvedValue([]);
  mocks.listStoredScenarioStepEditorDocuments.mockResolvedValue([]);
  mocks.listScenarioProjectEntries.mockResolvedValue([]);
  mocks.listScenarioAssets.mockResolvedValue([]);
  mocks.listScenarioExports.mockResolvedValue([]);
  mocks.listVideoProjectEntries.mockResolvedValue([]);
});

it.each([
  {
    ownerId: 'recording-usage',
    ownerKind: 'recording',
    source: { kind: 'recording', recordingId: 'recording-usage' },
  },
  {
    ownerId: 'export-usage',
    ownerKind: 'project-export',
    source: { exportId: 'export-usage', kind: 'project-export' },
  },
  {
    ownerId: 'project-asset-usage',
    ownerKind: 'project-asset',
    source: { kind: 'project-asset', projectAssetId: 'project-asset-usage' },
  },
])('uses AssetRef size as the authority for $ownerKind usage', async (fixture) => {
  mocks.listMediaLibrary.mockResolvedValue([
    {
      id: `media:${fixture.ownerId}`,
      size: 999,
      source: fixture.source,
    },
  ]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (storeName: string) => {
        if (storeName === 'asset_refs') return [createRef('recording-asset', 17)];
        if (storeName === 'asset_owners') {
          return [
            {
              assetId: 'recording-asset',
              ownerId: fixture.ownerId,
              ownerKind: fixture.ownerKind,
              role: 'body',
            },
          ];
        }
        return [];
      }),
    })
  );

  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes: 0,
    libraryBytes: 17,
    trashBytes: 0,
    totalBytes: 17,
  });
});

it('does not fall back to stale media size when durable authority is missing', async () => {
  mocks.listMediaLibrary.mockResolvedValue([
    {
      id: 'recording:missing-authority',
      size: 999,
      source: { kind: 'recording', recordingId: 'missing-authority' },
    },
  ]);
  mocks.runMutation.mockImplementation(async (effect) => effect({ getAll: vi.fn(async () => []) }));

  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes: 0,
    libraryBytes: 0,
    trashBytes: 0,
    totalBytes: 0,
  });
});

it('counts one immutable file once when library identities share its physical ref', async () => {
  mocks.listMediaLibrary.mockResolvedValue([
    { id: 'recording:one', size: 99, source: { kind: 'recording', recordingId: 'one' } },
    { id: 'scenario-asset:one', size: 99, source: { kind: 'stored-asset', assetId: 'shared' } },
  ]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (storeName: string) => {
        if (storeName === 'asset_refs') return [createRef('shared', 17)];
        if (storeName === 'asset_owners')
          return [
            { assetId: 'shared', ownerId: 'one', ownerKind: 'recording', role: 'body' },
            {
              assetId: 'shared',
              ownerId: 'scenario-asset:one',
              ownerKind: 'media-library',
              role: 'source',
            },
          ];
        return [];
      }),
    })
  );
  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes: 0,
    libraryBytes: 17,
    trashBytes: 0,
    totalBytes: 17,
  });
});

it('counts both durable package and screenshot bytes for a web snapshot', async () => {
  mocks.listMediaLibrary.mockResolvedValue([
    {
      id: 'snapshot-1',
      size: 999,
      source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    },
  ]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (storeName: string) => {
        if (storeName === 'asset_refs') {
          return [createRef('package-asset', 17), createRef('screenshot-asset', 23)];
        }
        if (storeName === 'asset_owners') {
          return [
            {
              assetId: 'package-asset',
              ownerId: 'snapshot-1',
              ownerKind: 'web-snapshot',
              role: 'package',
            },
            {
              assetId: 'screenshot-asset',
              ownerId: 'snapshot-1',
              ownerKind: 'web-snapshot',
              role: 'screenshot',
            },
          ];
        }
        return [];
      }),
    })
  );

  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes: 0,
    libraryBytes: 40,
    trashBytes: 0,
    totalBytes: 40,
  });
});

it('counts only declared web snapshot refs and preserves bounded legacy media sizes', async () => {
  mocks.listMediaLibrary.mockResolvedValue([
    {
      id: 'snapshot-1',
      size: 999,
      source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    },
    { id: 'legacy-screenshot', size: 11, source: { kind: 'screenshot' } },
  ]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (storeName: string) => {
        if (storeName === 'asset_refs') return [createRef('package-asset', 17)];
        if (storeName === 'asset_owners') {
          return [
            {
              assetId: 'package-asset',
              ownerId: 'snapshot-1',
              ownerKind: 'web-snapshot',
              role: 'package',
            },
          ];
        }
        return [];
      }),
    })
  );

  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes: 0,
    libraryBytes: 28,
    trashBytes: 0,
    totalBytes: 28,
  });
});

it('accounts for temporary aggregate graphs, thumbnails, and presentation ownership', async () => {
  const workspace = {
    aggregateId: 'image-1',
    document: { assets: [{ assetId: 'workspace-asset' }, { assetId: 'workspace-asset' }] },
  };
  const videoProject = {
    id: 'video-1',
    lifecycle: { storageClass: 'temporary' },
    project: { title: 'Video' },
  };
  const scenarioProject = {
    id: 'scenario-1',
    lifecycle: { storageClass: 'temporary' },
    project: { title: 'Scenario' },
  };
  const stepDocument = {
    document: { assets: [{ assetId: 'step-asset' }, { assetId: 'step-asset' }] },
    stepId: 'step-1',
  };
  mocks.listMediaLibrary.mockResolvedValue([
    {
      hasThumbnail: true,
      id: 'image-1',
      lifecycle: { storageClass: 'temporary', trashedAt: 0 },
      size: -10,
      source: { kind: 'screenshot' },
    },
  ]);
  mocks.recoverAndListStoredImageWorkspaces.mockResolvedValue([workspace]);
  mocks.listVideoProjectEntries.mockResolvedValue([videoProject]);
  mocks.listScenarioProjectEntries.mockResolvedValue([scenarioProject]);
  mocks.listScenarioAssets.mockResolvedValue([{ assetId: 'scenario-asset' }]);
  mocks.listScenarioExports.mockResolvedValue([{ id: 'export-1', size: 13 }]);
  mocks.listStoredScenarioStepEditorDocuments.mockResolvedValue([stepDocument]);
  mocks.getMediaThumbnail.mockImplementation(async (id: string) => {
    const sizes: Record<string, number> = {
      'image-1': 2,
      'scenario-export:export-1': 7,
      'scenario:scenario-1': 5,
      'video-project:video-1': 3,
    };
    const size = sizes[id];
    return size === undefined ? undefined : { blob: new Blob([new Uint8Array(size)]) };
  });
  mocks.listAggregatePresentations.mockResolvedValue([
    {
      aggregateId: 'image-1',
      aggregateKind: 'image',
      previewBlob: new Blob(['preview']),
      thumbnailBlob: new Blob(['thumb']),
    },
    {
      aggregateId: 'scenario-1',
      aggregateKind: 'scenario',
      previewBlob: null,
      thumbnailBlob: new Blob(['s']),
    },
    {
      aggregateId: 'video-1',
      aggregateKind: 'video',
      previewBlob: null,
      thumbnailBlob: new Blob(['v']),
    },
    {
      aggregateId: 'missing',
      aggregateKind: 'video',
      previewBlob: new Blob(['ignored']),
      thumbnailBlob: new Blob(['ignored']),
    },
  ]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (storeName: string) =>
        storeName === 'asset_refs'
          ? [
              createRef('workspace-asset', 11),
              createRef('scenario-asset', 17),
              createRef('step-asset', 19),
            ]
          : []
      ),
    })
  );
  const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const expected =
    2 +
    jsonBytes(workspace) +
    11 +
    jsonBytes(videoProject.project) +
    3 +
    jsonBytes(scenarioProject.project) +
    17 +
    jsonBytes(stepDocument) +
    19 +
    5 +
    13 +
    7 +
    5 +
    7 +
    1 +
    1;

  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes: expected,
    libraryBytes: 0,
    trashBytes: 2 + jsonBytes(workspace) + 11 + 5 + 7,
    totalBytes: expected,
  });
});

it('counts a shared asset in Trash after an active root regardless of media order', async () => {
  const active = {
    id: 'active',
    lifecycle: { storageClass: 'library' },
    size: 999,
    source: { kind: 'stored-asset', assetId: 'shared' },
  };
  const trashed = {
    id: 'trashed',
    lifecycle: { storageClass: 'temporary', trashedAt: 0 },
    size: 999,
    source: { kind: 'stored-asset', assetId: 'shared' },
  };
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (storeName: string) =>
        storeName === 'asset_refs' ? [createRef('shared', 17)] : []
      ),
    })
  );

  for (const entries of [
    [active, trashed],
    [trashed, active],
  ]) {
    mocks.listMediaLibrary.mockResolvedValue(entries);
    await expect(getLibraryStorageUsage()).resolves.toEqual({
      draftsBytes: entries[0] === active ? 0 : 17,
      libraryBytes: entries[0] === active ? 17 : 0,
      trashBytes: 17,
      totalBytes: 17,
    });
  }
});

it('deduplicates an asset shared by two trashed roots within Trash', async () => {
  mocks.listMediaLibrary.mockResolvedValue([
    {
      id: 'one',
      lifecycle: { storageClass: 'library', trashedAt: 1 },
      size: 999,
      source: { kind: 'stored-asset', assetId: 'shared' },
    },
    {
      id: 'two',
      lifecycle: { storageClass: 'library', trashedAt: 2 },
      size: 999,
      source: { kind: 'stored-asset', assetId: 'shared' },
    },
  ]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (storeName: string) =>
        storeName === 'asset_refs' ? [createRef('shared', 17)] : []
      ),
    })
  );

  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes: 0,
    libraryBytes: 17,
    trashBytes: 17,
    totalBytes: 17,
  });
});

it('charges scenario and video retained graphs to their own trashed roots', async () => {
  const scenario = {
    id: 'scenario-1',
    lifecycle: { storageClass: 'temporary', trashedAt: 0 },
    project: { title: 'Scenario' },
  };
  const video = {
    id: 'video-1',
    lifecycle: { storageClass: 'library', trashedAt: 2 },
    project: { title: 'Video' },
  };
  const stepDocument = { document: { assets: [{ assetId: 'step-asset' }] }, stepId: 'step-1' };
  mocks.listMediaLibrary.mockResolvedValue([
    {
      id: 'published-export',
      lifecycle: { storageClass: 'library' },
      size: 9,
      source: { kind: 'screenshot' },
    },
  ]);
  mocks.listScenarioProjectEntries.mockResolvedValue([scenario]);
  mocks.listVideoProjectEntries.mockResolvedValue([video]);
  mocks.listScenarioAssets.mockResolvedValue([{ assetId: 'scenario-asset' }]);
  mocks.listScenarioExports.mockResolvedValue([{ id: 'export-1', size: 13 }]);
  mocks.listStoredScenarioStepEditorDocuments.mockResolvedValue([stepDocument]);
  mocks.getMediaThumbnail.mockImplementation(async (id: string) => {
    const sizes: Record<string, number> = {
      'scenario:scenario-1': 3,
      'scenario-export:export-1': 5,
      'video-project:video-1': 7,
    };
    return sizes[id] === undefined ? undefined : { blob: new Blob([new Uint8Array(sizes[id])]) };
  });
  mocks.listAggregatePresentations.mockResolvedValue([
    {
      aggregateId: 'scenario-1',
      aggregateKind: 'scenario',
      previewBlob: new Blob(['preview']),
      thumbnailBlob: new Blob(['thumb']),
    },
    {
      aggregateId: 'video-1',
      aggregateKind: 'video',
      previewBlob: null,
      thumbnailBlob: new Blob(['v']),
    },
  ]);
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (storeName: string) =>
        storeName === 'asset_refs'
          ? [createRef('scenario-asset', 17), createRef('step-asset', 19)]
          : []
      ),
    })
  );
  const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  const retained =
    jsonBytes(scenario.project) +
    jsonBytes(video.project) +
    jsonBytes(stepDocument) +
    17 +
    19 +
    13 +
    3 +
    5 +
    7 +
    5 +
    7 +
    1;

  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes:
      jsonBytes(scenario.project) + jsonBytes(stepDocument) + 17 + 19 + 13 + 3 + 5 + 5 + 7,
    libraryBytes: jsonBytes(video.project) + 7 + 1 + 9,
    trashBytes: retained - 13 - 5,
    totalBytes: retained + 9,
  });
});

it('uses the non-recovering workspace read for a Gallery usage request', async () => {
  mocks.listMediaLibrary.mockResolvedValue([]);
  mocks.runMutation.mockImplementation(async (effect) => effect({ getAll: vi.fn(async () => []) }));
  await expect(getLibraryStorageUsage({ recoverImageWorkspaces: false })).resolves.toEqual({
    draftsBytes: 0,
    libraryBytes: 0,
    trashBytes: 0,
    totalBytes: 0,
  });
  expect(mocks.listStoredImageWorkspaces).toHaveBeenCalledOnce();
  expect(mocks.recoverAndListStoredImageWorkspaces).not.toHaveBeenCalled();
});

function createRef(assetId: string, size: number) {
  return {
    assetId,
    createdAt: 1,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
    mimeType: 'video/webm',
    sha256: null,
    size,
  };
}

it.each([
  { parentTrashed: false, exportTrashed: true },
  { parentTrashed: true, exportTrashed: false },
  { parentTrashed: true, exportTrashed: true },
  { parentTrashed: false, exportTrashed: false },
])(
  'charges export body and thumbnail by their own Trash marker ($parentTrashed/$exportTrashed)',
  async ({ parentTrashed, exportTrashed }) => {
    const project = { title: 'Scenario' };
    const projectBytes = new TextEncoder().encode(JSON.stringify(project)).byteLength;
    mocks.listMediaLibrary.mockResolvedValue([]);
    mocks.listScenarioProjectEntries.mockResolvedValue([
      {
        id: 'scenario',
        project,
        lifecycle: { storageClass: 'temporary', ...(parentTrashed ? { trashedAt: 0 } : {}) },
      },
    ]);
    mocks.listScenarioExports.mockResolvedValue([
      {
        id: 'export',
        size: 13,
        ...(exportTrashed ? { trashState: { updatedAt: 1, trashedAt: 0 } } : {}),
      },
    ]);
    mocks.getMediaThumbnail.mockImplementation(async (id: string) =>
      id === 'scenario-export:export' ? { blob: new Blob([new Uint8Array(7)]) } : undefined
    );
    mocks.runMutation.mockImplementation(async (effect) =>
      effect({ getAll: vi.fn(async () => []) })
    );
    await expect(getLibraryStorageUsage()).resolves.toEqual({
      draftsBytes: projectBytes + 20,
      libraryBytes: 0,
      totalBytes: projectBytes + 20,
      trashBytes: (parentTrashed ? projectBytes : 0) + (exportTrashed ? 20 : 0),
    });
  }
);

it('includes a 1.5 MB image and 2 MB retained resource once alongside workspace metadata and thumbnails', async () => {
  const imageBytes = 1.5 * 1024 * 1024;
  const assetBytes = 2 * 1024 * 1024;
  const workspace = {
    aggregateId: 'image',
    document: { assets: [{ assetId: 'shared' }, { assetId: 'shared' }] },
  };
  mocks.listMediaLibrary.mockResolvedValue([
    {
      id: 'image',
      size: imageBytes,
      hasThumbnail: true,
      source: { kind: 'screenshot' },
      lifecycle: { storageClass: 'library', trashedAt: 0 },
    },
    { id: 'active', size: assetBytes, source: { kind: 'stored-asset', assetId: 'shared' } },
  ]);
  mocks.recoverAndListStoredImageWorkspaces.mockResolvedValue([workspace]);
  mocks.getMediaThumbnail.mockResolvedValue({ blob: new Blob([new Uint8Array(11)]) });
  mocks.runMutation.mockImplementation(async (effect) =>
    effect({
      getAll: vi.fn(async (store: string) =>
        store === 'asset_refs' ? [createRef('shared', assetBytes)] : []
      ),
    })
  );
  const retained =
    imageBytes + assetBytes + 11 + new TextEncoder().encode(JSON.stringify(workspace)).byteLength;
  await expect(getLibraryStorageUsage()).resolves.toEqual({
    draftsBytes: 0,
    libraryBytes: retained,
    totalBytes: retained,
    trashBytes: retained,
  });
});

it('does not start obsolete storage reads when cancelled before admission', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(getLibraryStorageUsage({ signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(mocks.listMediaLibrary).not.toHaveBeenCalled();
});

it('stops accounting after cancellation during the initial read', async () => {
  const controller = new AbortController();
  mocks.listMediaLibrary.mockImplementation(async () => {
    controller.abort();
    return [];
  });
  await expect(getLibraryStorageUsage({ signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
});
