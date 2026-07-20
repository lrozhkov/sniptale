import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import {
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_SECRET_PROTECTION_KEY,
  AI_SECRET_PROTECTION_TRANSITION_KEY,
  AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY,
} from '../../../composition/persistence/ai-settings/constants';
import type { MediaHubBackupManifest } from '../contracts/types';

interface FakeZipArchive {
  __fakeZipFiles: Map<string, Blob | string>;
}

const { FakeJSZip, initDBMock, listMediaLibraryMock } = vi.hoisted(() => {
  class FakeJSZip {
    private files = new Map<string, Blob | string>();

    file(path: string, value?: Blob | string): FakeJSZip | null {
      if (value === undefined) {
        return this.files.has(path) ? this : null;
      }
      this.files.set(path, value);
      return this;
    }

    async generateAsync(): Promise<FakeZipArchive> {
      return { __fakeZipFiles: new Map(this.files) };
    }
  }

  return {
    FakeJSZip,
    initDBMock: vi.fn(),
    listMediaLibraryMock: vi.fn(),
  };
});

vi.mock('jszip', () => ({ default: FakeJSZip }));

vi.mock(
  '../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<typeof import('jszip')>()),
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
  listMediaLibrary: listMediaLibraryMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createMediaEntry(
  source: MediaLibraryEntry['source'],
  overrides: Partial<MediaLibraryEntry> = {}
): MediaLibraryEntry {
  return {
    blob: new Blob(['asset']),
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

function readArchiveJson<T>(archive: FakeZipArchive, path: string): T {
  return JSON.parse(String(archive.__fakeZipFiles.get(path) ?? '')) as T;
}

function readArchiveText(archive: FakeZipArchive): string {
  return Array.from(archive.__fakeZipFiles.entries())
    .map(([path, value]) => `${path}\n${typeof value === 'string' ? value : '[blob]'}`)
    .join('\n');
}

function assertFakeZipArchive(value: unknown): asserts value is FakeZipArchive {
  expect(Object.getOwnPropertyDescriptor(value, '__fakeZipFiles')?.value).toBeInstanceOf(Map);
}

function createPrivacyFixtureEntries(): [MediaLibraryEntry, MediaLibraryEntry] {
  return [
    createMediaEntry(
      { kind: 'screenshot' },
      {
        sourceFavicon: 'https://example.com/favicon.ico?token=secret',
        sourceTitle: 'Secret reset page',
        sourceUrl: 'https://example.com/reset?token=secret#access_token=value',
      }
    ),
    createMediaEntry(
      { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
      {
        id: 'asset-2',
        kind: 'web-archive',
        sourceTitle: 'Private workspace',
        sourceUrl: 'https://workspace.example/invite/code',
      }
    ),
  ];
}

function setupPrivacyExportDb(firstEntry: MediaLibraryEntry, secondEntry: MediaLibraryEntry) {
  listMediaLibraryMock.mockResolvedValue([firstEntry, secondEntry]);
  initDBMock.mockResolvedValue({
    get: vi.fn(async (storeName: string, key: string) => {
      if (storeName !== 'media_library') {
        return undefined;
      }

      return key === firstEntry.id ? firstEntry : secondEntry;
    }),
    getAll: vi.fn(async () => []),
    getAllFromIndex: vi.fn(async () => []),
  });
}

function expectPrivacyMetadata(args: {
  firstEntry: MediaLibraryEntry;
  manifest: MediaHubBackupManifest;
  metadataText: string;
}) {
  const metadata = JSON.parse(args.metadataText);

  expect(args.manifest).toEqual(
    expect.objectContaining({
      assetCount: 1,
      dataClasses: expect.objectContaining({ sourceMetadata: false, webSnapshots: false }),
      privacyOptions: expect.objectContaining({
        includeSourceMetadata: false,
        includeWebSnapshots: false,
      }),
    })
  );
  expect(metadata).toEqual(
    expect.objectContaining({
      assets: [
        expect.objectContaining({
          entry: expect.objectContaining({
            id: args.firstEntry.id,
            sourceTitle: null,
            sourceUrl: null,
          }),
        }),
      ],
    })
  );
}

beforeEach(() => {
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
});

describe('media hub backup export privacy options', () => {
  it('applies source metadata and web snapshot exclusions to ZIP metadata', async () => {
    const [firstEntry, secondEntry] = createPrivacyFixtureEntries();
    setupPrivacyExportDb(firstEntry, secondEntry);

    const { exportMediaHubBackup } = await import('.');
    const archive = await exportMediaHubBackup({
      includeSourceMetadata: false,
      includeWebSnapshots: false,
    });
    assertFakeZipArchive(archive);
    const manifest = readArchiveJson<MediaHubBackupManifest>(archive, 'manifest.json');
    const metadataText = String(archive.__fakeZipFiles.get('metadata.json') ?? '');
    const archiveText = readArchiveText(archive);

    expectPrivacyMetadata({ firstEntry, manifest, metadataText });
    expect(metadataText).not.toContain('token=secret');
    expect(metadataText).not.toContain('Private workspace');
    for (const forbidden of [
      AI_PROVIDER_SECRETS_KEY,
      AI_LOCAL_SECRET_KEY_STORAGE_KEY,
      AI_SECRET_PROTECTION_KEY,
      AI_SECRET_PROTECTION_TRANSITION_KEY,
      AI_PASSPHRASE_SESSION_KEY_STORAGE_KEY,
      AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY,
      'transparent-key-material',
      'encrypted-provider-secret',
      'passphrase-protection-metadata',
      'local encryption key',
    ]) {
      expect(archiveText).not.toContain(forbidden);
    }
  });
});
