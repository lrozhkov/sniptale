import { describe, expect, it, vi } from 'vitest';

import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { createVideoProjectEntryWithMediaClip } from '../../../composition/persistence/projects/index.test-support.ts';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

describe('media hub backup scenario asset metadata guards', () => {
  it('rejects unsupported scenario asset MIME types in project descriptors', async () => {
    const { normalizeScenarioProject } = await import('./projects');

    expect(() =>
      normalizeScenarioProject({
        assets: [
          {
            blobPath: 'scenario-projects/scenario-1/assets/asset-1',
            entry: {
              createdAt: 1,
              galleryAssetId: null,
              height: 10,
              id: 'asset-1',
              mimeType: 'image/svg+xml',
              projectId: 'scenario-1',
              size: 20,
              width: 10,
            },
          },
        ],
        entry: createScenarioProjectEntry('scenario-1'),
        exports: [],
        stepDocuments: [],
      })
    ).toThrow('Unsupported scenario asset MIME type.');
  });

  it('rejects scenario asset descriptors without a stable descriptor id', async () => {
    const { normalizeScenarioProject } = await import('./projects');

    expect(() =>
      normalizeScenarioProject({
        assets: [
          {
            blobPath: 'scenario-projects/scenario-1/assets/asset-1',
            entry: { mimeType: 'image/png', projectId: 'scenario-1' },
          },
        ],
        entry: createScenarioProjectEntry('scenario-1'),
        exports: [],
        stepDocuments: [],
      })
    ).toThrow('shared.mediaHub.backupMetadataCorrupted');
  });
});

describe('media hub backup scenario project metadata malformed input guards', () => {
  it('rejects malformed nested scenario project entries through canonical parsers', async () => {
    const { normalizeScenarioProject } = await import('./projects');

    expect(() =>
      normalizeScenarioProject({
        assets: [],
        entry: { createdAt: 1, id: 'scenario-1', project: { id: 'other' }, updatedAt: 2 },
        exports: [],
        stepDocuments: [],
      })
    ).toThrow('Invalid scenario project backup metadata.');
  });

  it('rejects scenario export thumbnails that are not owned by exported scenario exports', async () => {
    const { normalizeScenarioProject } = await import('./projects');

    expect(() =>
      normalizeScenarioProject({
        assets: [],
        entry: createScenarioProjectEntry('scenario-1'),
        exportThumbnails: [
          {
            blobPath: 'scenario-projects/scenario-1/exports/export-1.thumb',
            entry: { assetId: 'unrelated-thumbnail-key' },
          },
        ],
        exports: [createScenarioExportEntry()],
        stepDocuments: [],
      })
    ).toThrow('Invalid scenario export thumbnail backup metadata.');
  });
});

describe('media hub backup project metadata filename guards', () => {
  it('rejects unsafe project export filenames at the backup metadata boundary', async () => {
    const { normalizeScenarioProject, normalizeVideoProject } = await import('./projects');

    expect(() =>
      normalizeVideoProject({
        entry: createVideoProjectEntry('video-1'),
        projectAssets: [],
        projectExports: [
          {
            entry: { ...createProjectExportEntry(), filename: '../escape.webm' },
            recording: {
              blobPath: 'video-projects/video-1/exports/export-1',
              entry: { filename: 'recording.webm', id: 'recording-1', size: 20 },
            },
          },
        ],
      })
    ).toThrow('Invalid export filename in backup metadata.');
    expect(() =>
      normalizeScenarioProject({
        assets: [],
        entry: createScenarioProjectEntry('scenario-1'),
        exports: [{ ...createScenarioExportEntry(), filename: 'CON' }],
        stepDocuments: [],
      })
    ).toThrow('Invalid export filename in backup metadata.');
  });
});

describe('media hub backup video project metadata malformed input guards', () => {
  it('rejects video project entries with missing project asset descriptors', async () => {
    const { normalizeVideoProject } = await import('./projects');
    const missingAssetReference = createVideoProjectEntryWithMediaClip();

    expect(() =>
      normalizeVideoProject({
        entry: {
          ...missingAssetReference,
          project: { ...missingAssetReference.project, assets: [] },
        },
        projectAssets: [],
        projectExports: [],
      })
    ).toThrow('Invalid video project backup metadata.');
  });
});

function createVideoProjectEntry(id: string) {
  return {
    createdAt: 1,
    id,
    project: { ...createEmptyVideoProject('Video backup'), id },
    updatedAt: 2,
  };
}

function createScenarioProjectEntry(id: string) {
  return {
    createdAt: 1,
    id,
    project: { ...createScenarioProjectV3('Scenario backup'), id },
    updatedAt: 2,
  };
}

function createProjectExportEntry() {
  return {
    createdAt: 1,
    duration: 1,
    filename: 'export.webm',
    fps: 30,
    height: 100,
    id: 'export-1',
    mimeType: 'video/webm',
    projectId: 'video-1',
    recordingId: 'recording-1',
    size: 10,
    width: 100,
  };
}

function createScenarioExportEntry() {
  return {
    createdAt: 1,
    filename: 'scenario.html',
    format: 'html',
    id: 'export-1',
    projectId: 'scenario-1',
    size: 10,
  };
}
