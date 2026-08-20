import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMediaThumbnail: vi.fn(),
  listAggregatePresentations: vi.fn(),
  recoverAndListStoredImageWorkspaces: vi.fn(),
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
    totalBytes: 0,
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
      lifecycle: { storageClass: 'temporary' },
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
    totalBytes: expected,
  });
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
