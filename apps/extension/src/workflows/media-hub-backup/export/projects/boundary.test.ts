import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createUnsafeScenarioProjectBundleDb } from './unsafe.test-support.ts';
import { exportBackupArchive } from './archive.test-support.ts';

const { FakeJSZip, initDBMock, listMediaLibraryMock, zipFileMock } = vi.hoisted(() => {
  const fileMock = vi.fn();
  class FakeJSZip {
    private files = new Map<string, Blob | string>();

    file(path: string, value?: Blob | string): FakeJSZip | null {
      fileMock(path, value);
      if (value === undefined) {
        return this.files.has(path) ? this : null;
      }
      this.files.set(path, value);
      return this;
    }

    async generateAsync() {
      return { __fakeZipFiles: new Map(this.files) };
    }
  }

  return { FakeJSZip, initDBMock: vi.fn(), listMediaLibraryMock: vi.fn(), zipFileMock: fileMock };
});

vi.mock('jszip', () => ({ default: FakeJSZip }));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
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

vi.mock('../../../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/media-library/index')
  >()),
  listMediaLibrary: listMediaLibraryMock,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

beforeEach(() => {
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
  zipFileMock.mockReset();
  listMediaLibraryMock.mockResolvedValue([]);
});

describe('media hub backup export scenario path boundary', () => {
  it.each([
    ['scenario project id', { projectId: '../scenario' }],
    ['scenario asset id', { assetId: '../asset' }],
    ['scenario export id', { exportId: '../export' }],
    ['scenario step document id', { stepId: '../step' }],
  ])('rejects unsafe %s before writing project backup paths', async (label, overrides) => {
    initDBMock.mockResolvedValue(createUnsafeScenarioProjectBundleDb(overrides));

    await expect(exportBackupArchive()).rejects.toThrow(`Invalid backup path segment: ${label}.`);
  });

  it('rejects unsafe scenario asset MIME before writing asset blobs to the ZIP', async () => {
    initDBMock.mockResolvedValue(
      createUnsafeScenarioProjectBundleDb({ assetMimeType: 'image/svg+xml' })
    );

    await expect(exportBackupArchive()).rejects.toThrow('Invalid scenario asset backup metadata.');
    expect(zipFileMock).not.toHaveBeenCalledWith(
      'scenario-projects/scenario-1/assets/scenario-asset-1',
      expect.any(Blob)
    );
  });
});
