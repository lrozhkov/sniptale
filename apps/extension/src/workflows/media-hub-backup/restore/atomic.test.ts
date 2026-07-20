import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { RecordingEntry } from '../../../composition/persistence/recordings/contracts';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { MediaHubBackupMetadata } from '../contracts/types';

const {
  getMediaLibraryEntryMock,
  getScenarioProjectMock,
  getStoreMock,
  getVideoProjectMock,
  initDBMock,
  publishMediaHubLibraryChangedMock,
  withMediaHubWriteGuardMock,
} = vi.hoisted(() => ({
  getMediaLibraryEntryMock: vi.fn(),
  getScenarioProjectMock: vi.fn(),
  getStoreMock: vi.fn(),
  getVideoProjectMock: vi.fn(),
  initDBMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  withMediaHubWriteGuardMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
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

vi.mock('../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/media-library/index')
  >()),
  getMediaLibraryEntry: getMediaLibraryEntryMock,
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),
  getVideoProject: getVideoProjectMock,
}));

vi.mock('../../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/projects')>()),
  getScenarioProject: getScenarioProjectMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
}));

vi.mock('../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage')>()),
  getStore: getStoreMock,
}));

vi.mock('../../../features/media-hub/storage-errors', () => ({
  createMediaHubStorageHeadroomError: vi.fn(),
  withMediaHubWriteGuard: withMediaHubWriteGuardMock,
}));

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<Omit<MediaLibraryEntry, 'blob'>> = {}
): Omit<MediaLibraryEntry, 'blob'> {
  return {
    createdAt: 10,
    duration: null,
    filename: 'asset.png',
    height: 1080,
    id: 'asset-1',
    kind: 'screenshot',
    mimeType: 'image/png',
    originalFilename: 'asset.png',
    size: 123,
    source,
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
    ...overrides,
  };
}

function createWriteHarness() {
  const stores = new Map(
    [
      'media_library',
      'project_assets',
      'project_exports',
      'recording_telemetry',
      'recordings',
      'scenario_assets',
      'scenario_exports',
      'scenario_projects',
      'scenario_step_editor_documents',
      'thumbnails',
      'video_effect_bundles',
      'video_projects',
    ].map((name) => [name, { delete: vi.fn(), get: vi.fn(), index: vi.fn(), put: vi.fn() }])
  );

  initDBMock.mockResolvedValue({
    transaction: vi.fn().mockReturnValue({
      done: Promise.resolve(),
    }),
  });
  getStoreMock.mockImplementation((_tx, storeName: string) => {
    const store = stores.get(storeName);
    if (!store) {
      throw new Error(`Unknown store ${storeName}`);
    }

    return store;
  });

  return { stores };
}

function createProjectMissingRecordingMetadata(): MediaHubBackupMetadata {
  return {
    assets: [
      {
        assetPath: 'assets/asset-1',
        entry: createMediaEntry({ kind: 'screenshot' }, { id: 'asset-1' }),
        thumbnailPath: null,
      },
    ],
    effectBundles: [],
    videoProjects: [
      {
        entry: {
          createdAt: 1,
          id: 'video-1',
          project: { ...createEmptyVideoProject('Video'), id: 'video-1' },
          updatedAt: 1,
        },
        projectAssets: [],
        projectExports: [
          {
            entry: {
              createdAt: 1,
              duration: 1,
              filename: 'export.webm',
              fps: 30,
              height: 100,
              id: 'export-1',
              projectId: 'video-1',
              recordingId: 'recording-1',
              size: 10,
              width: 100,
            },
            recording: {
              blobPath: 'recordings/missing',
              entry: createRecordingDescriptorEntry(),
            },
          },
        ],
      },
    ],
  };
}

function createRecordingDescriptorEntry(): Omit<RecordingEntry, 'blob'> {
  return {
    createdAt: 1,
    filename: 'recording.webm',
    id: 'recording-1',
    size: 10,
  };
}

function createZipWithStandaloneAssetOnly(): JSZip {
  return new JSZip().file('assets/asset-1', 'asset-1');
}

beforeEach(() => {
  vi.clearAllMocks();
  getScenarioProjectMock.mockResolvedValue(undefined);
  getVideoProjectMock.mockResolvedValue({ status: 'notFound' });
  withMediaHubWriteGuardMock.mockImplementation(async (_operation, callback: () => Promise<void>) =>
    callback()
  );
});

describe('import media hub backup assets atomic restore flows', () => {
  it('keeps multi-asset restore atomic when a later archive payload is missing', async () => {
    const { importMediaHubBackupAssets } = await import('.');
    const { stores } = createWriteHarness();
    getMediaLibraryEntryMock.mockResolvedValue(undefined);

    const metadata: MediaHubBackupMetadata = {
      assets: [
        {
          assetPath: 'assets/asset-1',
          entry: createMediaEntry({ kind: 'screenshot' }, { id: 'asset-1' }),
          thumbnailPath: null,
        },
        {
          assetPath: 'assets/asset-2',
          entry: createMediaEntry(
            { kind: 'screenshot' },
            { filename: 'asset-2.png', id: 'asset-2' }
          ),
          thumbnailPath: null,
        },
      ],
      effectBundles: [],
    };
    const zip = new JSZip().file('assets/asset-1', 'asset-1');

    await expect(
      importMediaHubBackupAssets({
        metadata,
        remapEntryForDuplicate: vi.fn(),
        strategy: 'replace',
        zip,
      })
    ).rejects.toThrow('shared.mediaHub.backupAssetBlobMissingPrefix asset-2.png.');

    expect(stores.get('media_library')?.put).not.toHaveBeenCalled();
    expect(stores.get('media_library')?.delete).not.toHaveBeenCalled();
    expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
  });
});

describe('import media hub backup project payload preflight', () => {
  it('does not write standalone assets when a project archive payload is missing', async () => {
    const { importMediaHubBackupAssets } = await import('.');
    const transactionMock = vi.fn(() => {
      throw new Error('should not open write transaction');
    });
    getMediaLibraryEntryMock.mockResolvedValue(undefined);
    initDBMock.mockResolvedValue({
      get: vi.fn().mockResolvedValue(undefined),
      transaction: transactionMock,
    });

    await expect(
      importMediaHubBackupAssets({
        metadata: createProjectMissingRecordingMetadata(),
        remapEntryForDuplicate: vi.fn(),
        strategy: 'replace',
        zip: createZipWithStandaloneAssetOnly(),
      })
    ).rejects.toThrow('shared.mediaHub.backupAssetBlobMissingPrefix recordings/missing.');

    expect(transactionMock).not.toHaveBeenCalled();
    expect(publishMediaHubLibraryChangedMock).not.toHaveBeenCalled();
  });
});
