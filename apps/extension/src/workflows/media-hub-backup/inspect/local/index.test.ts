import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import { createScenarioProjectV3 } from '../../../../features/scenario/project/v3';
import { createVideoProjectFixture } from '../../export/projects/video-fixture.test-support.ts';

const { initDBMock, listMediaLibraryMock } = vi.hoisted(() => ({
  initDBMock: vi.fn(),
  listMediaLibraryMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    PROJECT_ASSETS_STORE: 'project_assets',
    PROJECT_EXPORTS_STORE: 'project_exports',
    RECORDING_TELEMETRY_STORE: 'recording_telemetry',
    SCENARIO_ASSETS_STORE: 'scenario_assets',
    SCENARIO_EXPORTS_STORE: 'scenario_exports',
    SCENARIO_PROJECTS_STORE: 'scenario_projects',
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
    STORE_NAME: 'recordings',
    THUMBNAILS_STORE: 'thumbnails',
    VIDEO_PROJECTS_STORE: 'video_projects',
    initDB: initDBMock,
  })
);

vi.mock('../../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/media-library/index')
  >()),
  listMediaLibrary: listMediaLibraryMock,
}));

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<MediaLibraryEntry> = {}
): MediaLibraryEntry {
  return {
    blob: new Blob(['asset']),
    createdAt: 1,
    duration: null,
    filename: 'asset.png',
    height: 720,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 100,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 2,
    width: 1280,
    ...overrides,
  };
}

beforeEach(() => {
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
});

function createInspectionEntries(): [MediaLibraryEntry, MediaLibraryEntry] {
  return [
    createMediaEntry(
      { kind: 'screenshot' },
      { sourceTitle: 'Private page', sourceUrl: 'https://example.test/reset?token=secret' }
    ),
    createMediaEntry(
      { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
      { id: 'asset-2', kind: 'web-archive', size: 200 }
    ),
  ];
}

function setupInspectionDb(screenshot: MediaLibraryEntry, webSnapshot: MediaLibraryEntry) {
  listMediaLibraryMock.mockResolvedValue([screenshot, webSnapshot]);
  initDBMock.mockResolvedValue({
    get: vi.fn(readInspectionRecord),
    getAll: vi.fn((storeName: string) => readInspectionStore(storeName, screenshot)),
    getAllFromIndex: vi.fn(readInspectionIndex),
  });
}

async function readInspectionRecord(storeName: string, key: string) {
  if (storeName === 'thumbnails' && key === 'scenario:scenario-1') {
    return { assetId: key, blob: new Blob(['scenario-thumb']) };
  }
  if (storeName === 'thumbnails' && key === 'export:export-1') {
    return { assetId: key, blob: new Blob(['export-thumb']) };
  }
  if (storeName === 'thumbnails' && key === 'scenario-export:scenario-export-1') {
    return { assetId: key, blob: new Blob(['scenario-export-thumb']) };
  }
  if (storeName === 'project_assets' && key === 'project-asset-1') {
    return { id: key, blob: new Blob(['asset']), size: 500 };
  }
  return storeName === 'recordings' && key === 'recording-1'
    ? { id: key, blob: new Blob(['recording']), size: 700 }
    : undefined;
}

async function readInspectionStore(storeName: string, screenshot: MediaLibraryEntry) {
  if (storeName === 'thumbnails') {
    return [{ assetId: screenshot.id, blob: new Blob(['thumb']) }];
  }
  if (storeName === 'scenario_projects') {
    return [createScenarioProjectEntry()];
  }
  return storeName === 'video_projects'
    ? [createVideoProjectEntry()]
    : readStepDocuments(storeName);
}

function createScenarioProjectEntry() {
  const project = { ...createScenarioProjectV3('Scenario'), id: 'scenario-1' };
  return { id: 'scenario-1', project, createdAt: 1, updatedAt: 2 };
}

function createVideoProjectEntry() {
  return {
    id: 'video-project-1',
    project: createVideoProjectFixture('video-project-1', [
      { source: { kind: 'project-asset', projectAssetId: 'project-asset-1' } },
    ]),
    createdAt: 1,
    updatedAt: 2,
  };
}

function readStepDocuments(storeName: string) {
  return storeName === 'scenario_step_editor_documents'
    ? [{ projectId: 'scenario-1', stepId: 'step-1' }]
    : [];
}

async function readInspectionIndex(storeName: string) {
  if (storeName === 'scenario_assets') {
    return [{ id: 'scenario-asset-1', projectId: 'scenario-1', size: 300 }];
  }
  if (storeName === 'scenario_exports') {
    return [{ id: 'scenario-export-1', projectId: 'scenario-1', size: 400 }];
  }
  return storeName === 'project_exports'
    ? [{ id: 'export-1', projectId: 'video-project-1', recordingId: 'recording-1' }]
    : [];
}

describe('inspect local media hub backup', () => {
  it('summarizes selected backup contents and privacy option counts', async () => {
    const [screenshot, webSnapshot] = createInspectionEntries();
    setupInspectionDb(screenshot, webSnapshot);

    const { inspectLocalMediaHubBackup } = await import('.');
    const summary = await inspectLocalMediaHubBackup({
      scope: 'selected',
      selected: {
        mediaAssetIds: [screenshot.id],
        scenarioProjectIds: ['scenario-1'],
        videoProjectIds: ['video-project-1'],
      },
      includeWebSnapshots: false,
    });

    expect(summary).toEqual(
      expect.objectContaining({
        assetCount: 1,
        editorDraftCount: 1,
        recordingCount: 1,
        scenarioProjectCount: 1,
        selectedCount: 3,
        sourceMetadataCount: 1,
        thumbnailCount: 4,
        videoProjectCount: 1,
        webSnapshotCount: 0,
      })
    );
    expect(summary.dataClasses).toEqual(
      expect.objectContaining({ sourceMetadata: true, webSnapshots: false })
    );
  });
});
