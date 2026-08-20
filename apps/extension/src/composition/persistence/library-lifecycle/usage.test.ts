import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listAggregatePresentations: vi.fn(),
  listImageWorkspaces: vi.fn(),
  listMediaLibrary: vi.fn(),
  listScenarioProjectEntries: vi.fn(),
  listVideoProjectEntries: vi.fn(),
  runMutation: vi.fn(),
}));

vi.mock('../aggregate-presentations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../aggregate-presentations')>()),
  listAggregatePresentations: mocks.listAggregatePresentations,
}));
vi.mock('../image-workspaces', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../image-workspaces')>()),
  listImageWorkspaces: mocks.listImageWorkspaces,
}));
vi.mock('../media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-library')>()),
  getMediaThumbnail: vi.fn(),
  listMediaLibrary: mocks.listMediaLibrary,
}));
vi.mock('../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../projects')>()),
  listVideoProjectEntries: mocks.listVideoProjectEntries,
}));
vi.mock('../scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/projects')>()),
  listScenarioAssets: vi.fn(),
  listScenarioExports: vi.fn(),
  listScenarioProjectEntries: mocks.listScenarioProjectEntries,
}));
vi.mock('../scenario/editor-documents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../scenario/editor-documents')>()),
  listScenarioStepEditorDocuments: vi.fn(),
}));
vi.mock('../infrastructure/indexed-db/mutation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/mutation')>()),
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { getLibraryStorageUsage } from './usage';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listAggregatePresentations.mockResolvedValue([]);
  mocks.listImageWorkspaces.mockResolvedValue([]);
  mocks.listScenarioProjectEntries.mockResolvedValue([]);
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
