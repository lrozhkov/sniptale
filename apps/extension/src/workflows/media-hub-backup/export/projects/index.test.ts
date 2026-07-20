import { beforeEach, expect, it, vi } from 'vitest';
import { parseBackupMetadata } from '../../metadata';
import {
  createInvalidScenarioV3ProjectBundleDb,
  createInvalidVideoProjectBundleDb,
  createEffectProjectBundleDb,
  createProjectBundleDb,
  createSparseProjectBundleDb,
  createUnsupportedEngine1VideoProjectBundleDb,
} from './test-support';
import { createLegacyScenarioProjectBundleDb } from './legacy.test-support.ts';
import {
  createOversizedVideoProjectAssetBundleDb,
  createOversizedVideoProjectExportBundleDb,
} from './oversized.test-support.ts';
import { exportBackupArchive, readArchiveJson } from './archive.test-support.ts';
import type { MediaHubBackupManifest, MediaHubBackupMetadata } from '../../contracts/types';

const { FakeJSZip, generateAsyncMock, initDBMock, listMediaLibraryMock } = vi.hoisted(() => {
  class FakeJSZip {
    private files = new Map<string, Blob | string>();

    file(path: string, value?: Blob | string): FakeJSZip | null {
      if (value === undefined) {
        return this.files.has(path) ? this : null;
      }
      this.files.set(path, value);
      return this;
    }

    async generateAsync() {
      generateAsyncMock();
      return { __fakeZipFiles: new Map(this.files) };
    }
  }

  return {
    FakeJSZip,
    generateAsyncMock: vi.fn(),
    initDBMock: vi.fn(),
    listMediaLibraryMock: vi.fn(),
  };
});

vi.mock('jszip', () => ({ default: FakeJSZip }));

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

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

beforeEach(() => {
  generateAsyncMock.mockReset();
  initDBMock.mockReset();
  listMediaLibraryMock.mockReset();
  listMediaLibraryMock.mockResolvedValue([]);
});

it('exports video and scenario project bundles in v3 metadata', async () => {
  initDBMock.mockResolvedValue(createProjectBundleDb());

  const archive = await exportBackupArchive();
  const manifest = readArchiveJson<MediaHubBackupManifest>(archive, 'manifest.json');
  const metadata = readArchiveJson<MediaHubBackupMetadata>(archive, 'metadata.json');

  expect(manifest).toMatchObject({ scenarioProjectCount: 1, videoProjectCount: 1 });
  expect(metadata.videoProjects?.[0]).toMatchObject({
    entry: expect.objectContaining({ id: 'video-project-1' }),
    projectAssets: [
      expect.objectContaining({ blobPath: 'video-projects/video-project-1/assets/asset-1' }),
    ],
  });
  expect(metadata.scenarioProjects?.[0]).toMatchObject({
    assets: [
      expect.objectContaining({
        blobPath: 'scenario-projects/scenario-1/assets/scenario-asset-1',
      }),
    ],
    exports: [expect.objectContaining({ id: 'scenario-export-1' })],
    stepDocuments: [expect.objectContaining({ stepId: 'step-1' })],
  });
  expect(parseBackupMetadata(metadata)).toEqual(metadata);
});

it('keeps v2 project bundles valid when optional blobs are absent', async () => {
  initDBMock.mockResolvedValue(createSparseProjectBundleDb());

  const archive = await exportBackupArchive();
  const metadata = readArchiveJson<MediaHubBackupMetadata>(archive, 'metadata.json');

  expect(metadata.videoProjects?.[0]).toMatchObject({ projectAssets: [], projectExports: [] });
  expect(metadata.scenarioProjects?.[0]).toMatchObject({
    assets: [],
    exportThumbnails: [],
    exports: [],
    stepDocuments: [],
  });
  expect(parseBackupMetadata(metadata)).toEqual(metadata);
});

it('extracts nested EffectV1 snapshot blobs into bounded archive entries', async () => {
  initDBMock.mockResolvedValue(await createEffectProjectBundleDb());

  const archive = await exportBackupArchive();
  const metadata = readArchiveJson<MediaHubBackupMetadata>(archive, 'metadata.json');
  const descriptor = metadata.videoProjects?.[0];

  expect(descriptor?.entry.project.effectSnapshots).toBeUndefined();
  expect(descriptor?.entry.project.effectInstances).toBeUndefined();
  expect(descriptor?.effectProject).toEqual(
    expect.objectContaining({
      instances: [expect.objectContaining({ id: 'effect-instance-1' })],
      snapshots: [
        expect.objectContaining({
          assets: [
            expect.objectContaining({
              blobPath: 'video-projects/video-project-effect/effects/0/0',
              entry: expect.not.objectContaining({ blob: expect.anything() }),
            }),
          ],
        }),
      ],
    })
  );
  expect(
    archive.__fakeZipFiles.get('video-projects/video-project-effect/effects/0/0')
  ).toBeInstanceOf(Blob);
  expect(parseBackupMetadata(metadata)).toEqual(metadata);
});
it('surfaces typed unsupported engine1 projects instead of silently dropping them', async () => {
  initDBMock.mockResolvedValue(createUnsupportedEngine1VideoProjectBundleDb());

  await expect(exportBackupArchive()).rejects.toEqual(
    expect.objectContaining({ code: 'unsupported-engine1' })
  );
  expect(generateAsyncMock).not.toHaveBeenCalled();
});

it('rejects hydratable video projects that cannot pass backup import validation', async () => {
  initDBMock.mockResolvedValue(createInvalidVideoProjectBundleDb());

  await expect(exportBackupArchive()).rejects.toThrow('Invalid video project backup metadata.');
});

it('rejects v3 scenario project exports with missing referenced child descriptors', async () => {
  initDBMock.mockResolvedValue(createInvalidScenarioV3ProjectBundleDb());

  await expect(exportBackupArchive()).rejects.toThrow('Invalid scenario project backup metadata.');
});

it('rejects legacy scenario project exports before archive generation', async () => {
  initDBMock.mockResolvedValue(createLegacyScenarioProjectBundleDb());

  await expect(exportBackupArchive()).rejects.toThrow(
    'shared.mediaHub.backupUnsupportedVersionPrefix scenario project 2.'
  );
  expect(generateAsyncMock).not.toHaveBeenCalled();
});

it('rejects oversized video project assets before archive generation', async () => {
  initDBMock.mockResolvedValue(createOversizedVideoProjectAssetBundleDb());

  await expect(exportBackupArchive()).rejects.toThrow('Media hub backup entry exceeds byte budget');
  expect(generateAsyncMock).not.toHaveBeenCalled();
});

it('rejects oversized video project export recordings before archive generation', async () => {
  initDBMock.mockResolvedValue(createOversizedVideoProjectExportBundleDb());

  await expect(exportBackupArchive()).rejects.toThrow('Media hub backup entry exceeds byte budget');
  expect(generateAsyncMock).not.toHaveBeenCalled();
});
