import { describe, expect, it, vi } from 'vitest';

import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoProjectEntryWithMediaClip } from '../../../composition/persistence/projects/index.test-support.ts';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../../features/editor/document/constants';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

function createTelemetry() {
  return {
    actionEvents: [
      {
        data: { button: 0 },
        duration: 0.4,
        id: 'action-1',
        kind: 'CLICK',
        label: 'Click',
        point: { x: 10, y: 20 },
        preset: 'CLICK_RIPPLE',
        time: 0.2,
      },
    ],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: createCursorTrack(),
    recordingId: 'recording-1',
    signals: [
      {
        data: { dwellMs: 1200 },
        endTime: 1.2,
        id: 'signal-1',
        kind: 'cursor-idle',
        point: null,
        startTime: 0.2,
      },
    ],
    updatedAt: 2,
    viewport: createViewport(),
  };
}

function createCursorTrack() {
  return {
    captureMode: 'separate',
    samples: [{ id: 'sample-1', time: 0.1, visible: true, x: 10, y: 20 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: true,
    },
  };
}

function createViewport() {
  return {
    devicePixelRatio: 2,
    height: 720,
    outerHeight: 860,
    outerWidth: 1300,
    scrollX: 0,
    scrollY: 100,
    viewportOffsetX: 10,
    viewportOffsetY: 30,
    width: 1280,
  };
}

function createEditorDocument() {
  return {
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasHeight: 180,
    canvasJson: '{"version":"7.2.0","objects":[]}',
    canvasWidth: 320,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    sourceDisplayHeight: 180,
    sourceDisplayWidth: 320,
    sourceHeight: 180,
    sourceImageData: 'data:image/png;base64,doc',
    sourceLeft: 0,
    sourceName: null,
    sourceTop: 0,
    sourceWidth: 320,
    version: 1 as const,
  };
}

describe('media hub backup project metadata normalizers', () => {
  it('normalizes video project descriptors with blobs, telemetry, and thumbnails', async () => {
    const { normalizeVideoProject } = await import('./projects');

    expect(
      normalizeVideoProject({
        entry: createVideoProjectEntry('video-1'),
        projectAssets: [
          {
            blobPath: 'video-projects/video-1/assets/project-asset-1',
            entry: { createdAt: 1, id: 'project-asset-1', mimeType: 'image/png', size: 10 },
          },
        ],
        projectExports: [
          {
            entry: createProjectExportEntry(),
            recording: {
              blobPath: 'video-projects/video-1/exports/export-1',
              entry: { filename: 'recording.webm', id: 'recording-1', size: 20 },
            },
            recordingTelemetry: createTelemetry(),
            thumbnail: {
              blobPath: 'video-projects/video-1/exports/export-1.thumb',
              entry: { assetId: 'export:export-1' },
            },
          },
        ],
        thumbnail: {
          blobPath: 'video-projects/video-1/thumbnail',
          entry: { assetId: 'video-project:video-1' },
        },
      })
    ).toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({ id: 'video-1' }),
        projectExports: expect.any(Array),
      })
    );
  });
});

describe('media hub backup scenario metadata normalizers', () => {
  it('normalizes scenario project descriptors with thumbnails and step documents', async () => {
    const { normalizeScenarioProject } = await import('./projects');

    expect(
      normalizeScenarioProject({
        assets: [
          {
            blobPath: 'scenario-projects/scenario-1/assets/asset-1',
            entry: {
              height: 50,
              id: 'asset-1',
              mimeType: 'image/png',
              projectId: 'scenario-1',
              size: 10,
              width: 100,
            },
          },
        ],
        entry: createScenarioProjectEntry('scenario-1'),
        exportThumbnails: [
          {
            blobPath: 'scenario-projects/scenario-1/exports/export-1.thumb',
            entry: { assetId: 'scenario-export:export-1' },
          },
        ],
        exports: [createScenarioExportEntry()],
        stepDocuments: [
          {
            createdAt: 1,
            document: createEditorDocument(),
            projectId: 'scenario-1',
            stepId: 'step-1',
            updatedAt: 2,
          },
        ],
        thumbnail: {
          blobPath: 'scenario-projects/scenario-1/thumbnail',
          entry: { assetId: 'scenario:scenario-1' },
        },
      })
    ).toEqual(expect.objectContaining({ assets: expect.any(Array), exports: expect.any(Array) }));
  });
});

describe('media hub backup minimal project metadata normalizers', () => {
  it('normalizes minimal project descriptors without optional metadata', async () => {
    const { normalizeScenarioProject, normalizeVideoProject } = await import('./projects');

    expect(
      normalizeVideoProject({
        entry: createVideoProjectEntry('video-1'),
        projectAssets: [],
        projectExports: [],
      })
    ).toEqual(expect.objectContaining({ projectAssets: [], projectExports: [] }));
    expect(
      normalizeScenarioProject({
        assets: [],
        entry: createScenarioProjectEntry('scenario-1'),
        exports: [],
        stepDocuments: [],
      })
    ).toEqual(expect.objectContaining({ assets: [], exports: [] }));
  });
});

describe('media hub backup video project metadata malformed input guards', () => {
  it('rejects malformed nested video project entries through canonical parsers', async () => {
    const { normalizeVideoProject } = await import('./projects');

    expect(() =>
      normalizeVideoProject({
        entry: { createdAt: 1, id: 'video-1', project: { assets: [] }, updatedAt: 2 },
        projectAssets: [],
        projectExports: [],
      })
    ).toThrow('Invalid video project backup metadata.');
  });

  it('rejects video project entries with missing backing project asset blobs', async () => {
    const { normalizeVideoProject } = await import('./projects');
    const missingAssetReference = createVideoProjectEntryWithMediaClip();

    expect(() =>
      normalizeVideoProject({
        entry: missingAssetReference,
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
