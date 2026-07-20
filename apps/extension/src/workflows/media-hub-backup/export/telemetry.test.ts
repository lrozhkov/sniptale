import { beforeEach, expect, it, vi } from 'vitest';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

interface FakeZipArchive {
  __fakeZipFiles: Map<string, Blob | string>;
}

const { FakeJSZip, initDBMock, listMediaLibraryMock, syncLegacyMediaLibraryMock } = vi.hoisted(
  () => {
    class FakeZipFile {
      constructor(private readonly value: Blob | string) {}

      async async(): Promise<Blob | string> {
        return this.value;
      }
    }

    class FakeJSZip {
      private files = new Map<string, Blob | string>();

      file(path: string, value?: Blob | string): FakeZipFile | FakeJSZip | null {
        if (value === undefined) {
          const existing = this.files.get(path);
          return existing === undefined ? null : new FakeZipFile(existing);
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
      syncLegacyMediaLibraryMock: vi.fn(),
    };
  }
);

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
  syncLegacyMediaLibrary: syncLegacyMediaLibraryMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createRecordingEntry(): MediaLibraryEntry {
  return {
    blob: new Blob(['recording']),
    createdAt: 10,
    duration: null,
    filename: 'capture.webm',
    height: 1080,
    id: 'recording:recording-1',
    kind: 'video',
    mimeType: 'video/webm',
    originalFilename: 'capture.webm',
    size: 123,
    source: { kind: 'recording', recordingId: 'recording-1' },
    sourceFavicon: null,
    sourceTitle: null,
    sourceUrl: null,
    tags: [],
    updatedAt: 20,
    width: 1920,
  };
}

function createRecordingTelemetry(): RecordingTelemetryEntry {
  return {
    actionEvents: [],
    captureMode: CaptureMode.TAB,
    createdAt: 1,
    cursorTrack: null,
    recordingId: 'recording-1',
    signals: [],
    updatedAt: 2,
    viewport: null,
  };
}

function assertFakeZipArchive(value: unknown): asserts value is FakeZipArchive {
  expect(Object.getOwnPropertyDescriptor(value, '__fakeZipFiles')?.value).toBeInstanceOf(Map);
}

beforeEach(() => {
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
  syncLegacyMediaLibraryMock.mockReset();
  syncLegacyMediaLibraryMock.mockResolvedValue(undefined);
});

it('exports recording telemetry sidecars with recording assets', async () => {
  const recordingEntry = createRecordingEntry();
  listMediaLibraryMock.mockResolvedValue([recordingEntry]);
  initDBMock.mockResolvedValue({
    get: vi.fn(async (storeName: string, key: string) => {
      if (storeName === 'media_library' && key === recordingEntry.id) {
        return recordingEntry;
      }

      if (storeName === 'recordings' && key === 'recording-1') {
        return { blob: new Blob(['recording']) };
      }

      if (storeName === 'recording_telemetry' && key === 'recording-1') {
        return createRecordingTelemetry();
      }

      return undefined;
    }),
    getAll: vi.fn(async () => []),
    getAllFromIndex: vi.fn(async () => []),
  });

  const { exportMediaHubBackup } = await import('.');
  const archive = await exportMediaHubBackup();
  assertFakeZipArchive(archive);
  const metadata = JSON.parse(String(archive.__fakeZipFiles.get('metadata.json') ?? ''));

  expect(metadata).toEqual(
    expect.objectContaining({
      assets: [
        expect.objectContaining({
          assetPath: 'assets/recording%3Arecording-1',
          entry: expect.objectContaining({ id: 'recording:recording-1' }),
          recordingTelemetry: expect.objectContaining({ recordingId: 'recording-1' }),
        }),
      ],
    })
  );
});

it('omits recording telemetry sidecars when telemetry export is disabled', async () => {
  const recordingEntry = createRecordingEntry();
  listMediaLibraryMock.mockResolvedValue([recordingEntry]);
  initDBMock.mockResolvedValue({
    get: vi.fn(async (storeName: string, key: string) => {
      if (storeName === 'media_library' && key === recordingEntry.id) {
        return recordingEntry;
      }

      if (storeName === 'recordings' && key === 'recording-1') {
        return { blob: new Blob(['recording']) };
      }

      if (storeName === 'recording_telemetry' && key === 'recording-1') {
        return createRecordingTelemetry();
      }

      return undefined;
    }),
    getAll: vi.fn(async () => []),
    getAllFromIndex: vi.fn(async () => []),
  });

  const { exportMediaHubBackup } = await import('.');
  const archive = await exportMediaHubBackup({
    includeTelemetry: false,
  });
  assertFakeZipArchive(archive);
  const metadata = JSON.parse(String(archive.__fakeZipFiles.get('metadata.json') ?? ''));

  expect(metadata).toEqual(
    expect.objectContaining({
      assets: [
        expect.not.objectContaining({
          recordingTelemetry: expect.anything(),
        }),
      ],
    })
  );
});
