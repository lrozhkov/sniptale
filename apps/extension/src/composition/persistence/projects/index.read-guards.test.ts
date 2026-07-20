import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createMediaLibraryEntry,
  createProjectAssetEntry,
  createProjectExportEntry,
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support.ts';
import { createScenarioProject } from '../../../features/scenario/project/factories';

const mocks = vi.hoisted(() => ({
  dbGet: vi.fn(),
  dbGetAll: vi.fn(),
  dbGetAllFromIndex: vi.fn(),
  initDB: vi.fn(),
  txDelete: vi.fn(),
  txGet: vi.fn(),
  txGetAll: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  PROJECT_EXPORTS_STORE: 'project_exports',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: mocks.initDB,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: vi.fn(),
}));

function createDb() {
  return {
    get: mocks.dbGet,
    getAll: mocks.dbGetAll,
    getAllFromIndex: mocks.dbGetAllFromIndex,
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: vi.fn(() => ({
        delete: mocks.txDelete,
        get: mocks.txGet,
        getAll: mocks.txGetAll,
        put: vi.fn(),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue(createDb());
  mocks.txGetAll.mockResolvedValue([]);
});

it('parses hydratable video project entries without requiring export-ready references', async () => {
  const { parseVideoProjectEntry } = await import('./read-guards');
  const validEntry = createVideoProjectEntry();
  const mismatchedEntry = createVideoProjectEntry({}, { id: 'other-project' });

  expect(parseVideoProjectEntry(validEntry)).toEqual(validEntry);
  expect(parseVideoProjectEntry(mismatchedEntry)).toBeNull();
  expect(parseVideoProjectEntry({ ...validEntry, project: { id: validEntry.id } })).toBeNull();
  const missingAssetReference = createVideoProjectEntryWithMediaClip();
  expect(
    parseVideoProjectEntry({
      ...missingAssetReference,
      project: { ...missingAssetReference.project, assets: [] },
    })
  ).toEqual({
    ...missingAssetReference,
    project: { ...missingAssetReference.project, assets: [] },
  });
});

it('parses media library entries across supported source kinds', async () => {
  const { parseMediaLibraryEntry } = await import('../media-library/read-guards');
  const sourceEntries = [
    createMediaLibraryEntry({ id: 'asset-screenshot', source: { kind: 'screenshot' } }),
    createMediaLibraryEntry({
      id: 'asset-project-asset',
      source: { kind: 'project-asset', projectAssetId: 'asset-1' },
    }),
    createMediaLibraryEntry({
      id: 'asset-recording',
      source: { kind: 'recording', recordingId: 'recording-1' },
    }),
    createMediaLibraryEntry({
      id: 'asset-export',
      source: {
        exportId: 'export-1',
        kind: 'project-export',
        projectId: 'project-1',
        recordingId: 'recording-1',
      },
    }),
    createMediaLibraryEntry({
      id: 'asset-snapshot',
      source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    }),
  ];

  expect(sourceEntries.map(parseMediaLibraryEntry)).toEqual(sourceEntries);
  const entry = createMediaLibraryEntry();
  expect(parseMediaLibraryEntry(null)).toBeNull();
  expect(parseMediaLibraryEntry({ ...entry, source: { kind: 'recording' } })).toBeNull();
  expect(parseMediaLibraryEntry({ ...entry, source: { kind: 'project-export' } })).toBeNull();
  expect(parseMediaLibraryEntry({ ...entry, source: { kind: 'unknown' } })).toBeNull();
  expect(parseMediaLibraryEntry({ ...entry, source: null })).toBeNull();
});

it('keeps hydratable persisted video projects visible before export-ready validation', async () => {
  const { getVideoProject, listVideoProjects } = await import('./index');
  const missingAssetReference = createVideoProjectEntryWithMediaClip();
  const hydratableEntry = {
    ...missingAssetReference,
    project: { ...missingAssetReference.project, assets: [] },
  };
  mocks.dbGet.mockResolvedValue(hydratableEntry);
  mocks.dbGetAll.mockResolvedValue([hydratableEntry]);
  await expect(getVideoProject(hydratableEntry.id)).resolves.toEqual({
    project: hydratableEntry.project,
    status: 'ready',
  });
  await expect(listVideoProjects()).resolves.toEqual([
    expect.objectContaining({ id: hydratableEntry.id }),
  ]);
});

it('classifies a structurally valid project with a corrupt EffectV1 snapshot as invalid', async () => {
  const source = readFileSync(
    new URL(
      '../../../../../../packages/runtime-contracts/src/effect-v1/fixtures/valid/' +
        'neutral-standalone.sniptale-effect.json',
      import.meta.url
    ),
    'utf8'
  );
  const document = JSON.parse(source) as { id: string };
  const sha256 = 'a'.repeat(64);
  const entry = createVideoProjectEntry({
    effectSnapshots: [
      {
        assets: [],
        documentId: document.id,
        id: `effect:${sha256}`,
        kind: 'standalone',
        retainedByteLength: new TextEncoder().encode(source).byteLength,
        schemaVersion: 'sniptale.effect.v1',
        sha256,
        source,
      },
    ],
  });
  mocks.dbGetAll.mockResolvedValue([entry]);
  await expect((await import('./index')).listVideoProjects()).resolves.toEqual([
    expect.objectContaining({ id: entry.id, unavailableReason: 'invalid' }),
  ]);
});

it('keeps engine1 projects visible but returns a typed unsupported read result', async () => {
  const { getVideoProject, listVideoProjects } = await import('./index');
  const currentEntry = createVideoProjectEntry();
  const legacyEntry = {
    ...currentEntry,
    project: { ...currentEntry.project, templateInstances: [] },
  };
  mocks.dbGet.mockResolvedValue(legacyEntry);
  mocks.dbGetAll.mockResolvedValue([legacyEntry]);
  await expect(getVideoProject(legacyEntry.id)).resolves.toEqual(
    expect.objectContaining({ status: 'unsupported' })
  );
  await expect(listVideoProjects()).resolves.toEqual([
    expect.objectContaining({
      id: legacyEntry.id,
      unavailableReason: 'unsupported-engine1',
    }),
  ]);
});
it('fails closed for malformed persisted video project rows', async () => {
  const { deleteVideoProject, getVideoProject, listVideoProjects } = await import('./index');
  const validEntry = createVideoProjectEntry({ name: 'Valid project' });
  const malformedNestedEntry = {
    ...createVideoProjectEntry({ id: 'nested-project', name: 'Nested broken project' }),
    project: {
      ...validEntry.project,
      id: 'nested-project',
      tracks: [
        {
          id: 'track-1',
          kind: 'PRIMARY',
          locked: false,
          name: 'Track',
          order: 0,
          visible: 'yes',
        },
      ],
    },
  };
  mocks.dbGet.mockResolvedValue(malformedNestedEntry);
  mocks.txGet.mockResolvedValue(malformedNestedEntry);
  mocks.dbGetAll.mockResolvedValue([
    validEntry,
    { id: 'broken-project', project: { id: 'broken-project' } },
    malformedNestedEntry,
  ]);
  await expect(getVideoProject('project-1')).resolves.toEqual(
    expect.objectContaining({ status: 'invalid' })
  );
  await expect(listVideoProjects()).resolves.toEqual([
    expect.objectContaining({ id: 'project-1', name: 'Valid project' }),
    expect.objectContaining({ id: 'broken-project', unavailableReason: 'invalid' }),
    expect.objectContaining({ id: 'nested-project', unavailableReason: 'invalid' }),
  ]);

  await deleteVideoProject('project-1');
  expect(mocks.txDelete).toHaveBeenCalledWith('project-1');
  expect(mocks.txDelete).not.toHaveBeenCalledWith('project-asset:asset-1');
});

it('fails closed for malformed persisted project asset rows', async () => {
  const { getProjectAsset, listProjectAssets } = await import('./index');
  mocks.dbGet.mockResolvedValue({ id: 'asset-1', mimeType: 'image/png' });
  mocks.dbGetAll
    .mockResolvedValueOnce([
      createProjectAssetEntry({ id: 'asset-1' }),
      { id: 'asset-2', mimeType: 'image/png', size: 8 },
    ])
    .mockResolvedValueOnce([
      createMediaLibraryEntry({ filename: 'from-library.png', id: 'project-asset:asset-1' }),
      { id: 'project-asset:asset-2', filename: 'broken.png' },
    ]);

  await expect(getProjectAsset('asset-1')).resolves.toBeUndefined();
  await expect(listProjectAssets()).resolves.toEqual([
    {
      createdAt: 200,
      filename: 'from-library.png',
      id: 'asset-1',
      mimeType: 'image/png',
      size: 12,
    },
  ]);
});

it('filters malformed project export rows from read and list paths', async () => {
  const { getProjectExport, listAllProjectExports, listProjectExports } = await import('./index');
  const exportEntry = createProjectExportEntry();
  const malformedExport = { id: 'broken-export', projectId: 'project-1' };
  mocks.dbGet.mockResolvedValue({ id: 'export-1', projectId: 'project-1' });
  mocks.dbGetAllFromIndex.mockResolvedValue([exportEntry, malformedExport]);
  mocks.dbGetAll.mockResolvedValue([exportEntry, malformedExport]);

  await expect(getProjectExport('export-1')).resolves.toBeUndefined();
  await expect(listProjectExports('project-1')).resolves.toEqual([exportEntry]);
  await expect(listAllProjectExports()).resolves.toEqual([exportEntry]);
});

it('parses scenario project and asset rows directly', async () => {
  const {
    parsePendingScenarioAssetEntry,
    parseScenarioAssetEntry,
    parseScenarioExportEntry,
    parseScenarioProjectEntry,
  } = await import('../scenario/read-guards');
  const blob = new Blob(['scenario'], { type: 'image/png' });
  const asset = {
    blob,
    createdAt: 1,
    galleryAssetId: null,
    height: 20,
    id: 'scenario-asset-1',
    mimeType: 'image/png',
    projectId: 'scenario-1',
    size: blob.size,
    width: 30,
  };
  const project = { ...createScenarioProject('Scenario'), id: 'scenario-1' };
  const entry = { createdAt: 1, id: project.id, project, updatedAt: 2 };

  expect(parseScenarioProjectEntry(entry)).toEqual(entry);
  expect(parseScenarioProjectEntry({ ...entry, project: { id: project.id } })).toBeNull();
  expect(parseScenarioAssetEntry(asset)).toEqual(asset);
  expect(parseScenarioAssetEntry({ ...asset, blob: {} })).toBeNull();
  expect(parsePendingScenarioAssetEntry({ ...asset, height: undefined, tabId: 7 })).toBeTruthy();
  expect(parsePendingScenarioAssetEntry({ ...asset, tabId: -1 })).toBeNull();
  expect(
    parseScenarioExportEntry({
      createdAt: 1,
      filename: 'scenario.html',
      format: 'html',
      id: 'scenario-export-1',
      projectId: 'scenario-1',
      size: 100,
    })
  ).toBeTruthy();
});
