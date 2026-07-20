import { beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import type { MediaHubBackupManifest, MediaHubBackupMetadata } from '../contracts/types';

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

  return { FakeJSZip, initDBMock: vi.fn(), listMediaLibraryMock: vi.fn() };
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

beforeEach(() => {
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
  listMediaLibraryMock.mockResolvedValue([]);
});

it('skips malformed scenario project rows before writing backup metadata', async () => {
  initDBMock.mockResolvedValue({
    get: vi.fn(async () => undefined),
    getAll: vi.fn(async (storeName: string) =>
      storeName === 'scenario_projects'
        ? [
            { id: 'broken-scenario', project: { id: 'broken-scenario', name: 'Broken' } },
            createScenarioProjectEntry('scenario-valid'),
          ]
        : []
    ),
    getAllFromIndex: vi.fn(async () => []),
  });

  const archive = await exportFakeBackupArchive();
  const manifest = readArchiveJson<MediaHubBackupManifest>(archive, 'manifest.json');
  const metadata = readArchiveJson<MediaHubBackupMetadata>(archive, 'metadata.json');

  expect(manifest.scenarioProjectCount).toBe(1);
  expect(metadata.scenarioProjects?.map((descriptor) => descriptor.entry.id)).toEqual([
    'scenario-valid',
  ]);
});

function createScenarioProjectEntry(id: string) {
  const project = { ...createScenarioProjectV3('Scenario'), createdAt: 1, id, updatedAt: 2 };
  return { createdAt: 1, id, project, updatedAt: 2 };
}

async function exportFakeBackupArchive(): Promise<FakeZipArchive> {
  const { exportMediaHubBackup } = await import('.');
  const archive: unknown = await exportMediaHubBackup();
  if (!isFakeZipArchive(archive)) {
    throw new Error('Expected fake zip archive');
  }
  return archive;
}

function isFakeZipArchive(value: unknown): value is FakeZipArchive {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__fakeZipFiles' in value &&
    value.__fakeZipFiles instanceof Map
  );
}

function readArchiveJson<T>(archive: FakeZipArchive, path: string): T {
  return JSON.parse(String(archive.__fakeZipFiles.get(path) ?? '')) as T;
}
