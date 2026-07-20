import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBackupMetadata } from '../../metadata';
import { createProjectBundleDb } from './test-support';
import { createSourceMetadataProjectBundleDb } from './source-metadata.test-support.ts';
import { exportBackupArchive, readArchiveJson } from './archive.test-support.ts';
import type {
  MediaHubBackupManifest,
  MediaHubBackupMetadata,
  ScenarioBackupProjectDescriptor,
} from '../../contracts/types';

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

    async generateAsync() {
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
  listMediaLibraryMock.mockResolvedValue([]);
});

function expectScenarioSourceMetadataRemoved(args: {
  manifest: MediaHubBackupManifest;
  metadata: MediaHubBackupMetadata;
}) {
  const scenarioProject = args.metadata.scenarioProjects?.[0];
  const captureSource = readScenarioCaptureSource(scenarioProject);
  const imageElement = readScenarioImageElement(scenarioProject);
  const editorDocument = scenarioProject?.stepDocuments[0]?.document;

  expect(args.manifest.dataClasses).toEqual(expect.objectContaining({ sourceMetadata: false }));
  expect(captureSource?.kind === 'capture' ? captureSource.page : null).toEqual(
    expect.objectContaining({ title: null, url: null })
  );
  expect(imageElement?.captureContext?.page).toEqual(
    expect.objectContaining({ title: null, url: null })
  );
  expect(editorDocument?.frame).toEqual(
    expect.objectContaining({ browserTitle: '', browserUrl: '' })
  );
  expect(editorDocument?.browserFrame).toEqual(
    expect.objectContaining({ faviconDataUrl: null, title: '', url: '' })
  );
}

function expectSensitiveSourceTextRemoved(metadata: MediaHubBackupMetadata) {
  const metadataText = JSON.stringify(metadata);
  expect(metadataText).not.toContain('token=secret');
  expect(metadataText).not.toContain('code=secret');
  expect(metadataText).not.toContain('Private reset page');
  expect(metadataText).not.toContain('Private image context page');
  expect(metadataText).not.toContain('Private editor page');
}

function readScenarioCaptureSource(project: ScenarioBackupProjectDescriptor | undefined) {
  return project?.entry.project.version === 3 ? project.entry.project.slides[0]?.source : null;
}

function readScenarioImageElement(project: ScenarioBackupProjectDescriptor | undefined) {
  const element =
    project?.entry.project.version === 3 ? project.entry.project.slides[0]?.elements[0] : null;
  return element?.kind === 'image' ? element : null;
}

describe('media hub backup project privacy options', () => {
  it('omits scenario editor draft documents when editor draft export is disabled', async () => {
    initDBMock.mockResolvedValue(createProjectBundleDb());

    const archive = await exportBackupArchive({ includeEditorDrafts: false });
    const manifest = readArchiveJson<MediaHubBackupManifest>(archive, 'manifest.json');
    const metadata = readArchiveJson<MediaHubBackupMetadata>(archive, 'metadata.json');

    expect(manifest.dataClasses).toEqual(expect.objectContaining({ editorDrafts: false }));
    expect(metadata.scenarioProjects?.[0]?.stepDocuments).toEqual([]);
    expect(readScenarioImageElement(metadata.scenarioProjects?.[0])?.editDocumentId).toBeNull();
    expect(parseBackupMetadata(metadata)).toEqual(metadata);
  });

  it('omits video project recording telemetry when telemetry export is disabled', async () => {
    initDBMock.mockResolvedValue(createProjectBundleDb());

    const archive = await exportBackupArchive({ includeTelemetry: false });
    const manifest = readArchiveJson<MediaHubBackupManifest>(archive, 'manifest.json');
    const metadata = readArchiveJson<MediaHubBackupMetadata>(archive, 'metadata.json');

    expect(manifest.dataClasses).toEqual(expect.objectContaining({ telemetry: false }));
    expect(metadata.videoProjects?.[0]?.projectExports[0]).toEqual(
      expect.not.objectContaining({ recordingTelemetry: expect.anything() })
    );
    expect(parseBackupMetadata(metadata)).toEqual(metadata);
  });

  it('omits scenario project and editor document source metadata when source metadata export is disabled', async () => {
    initDBMock.mockResolvedValue(createSourceMetadataProjectBundleDb());

    const archive = await exportBackupArchive({ includeSourceMetadata: false });
    const manifest = readArchiveJson<MediaHubBackupManifest>(archive, 'manifest.json');
    const metadata = readArchiveJson<MediaHubBackupMetadata>(archive, 'metadata.json');

    expectScenarioSourceMetadataRemoved({ manifest, metadata });
    expectSensitiveSourceTextRemoved(metadata);
    expect(parseBackupMetadata(metadata)).toEqual(metadata);
  });
});
