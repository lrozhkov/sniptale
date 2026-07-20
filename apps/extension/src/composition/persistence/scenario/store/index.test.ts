import { beforeEach, expect, it, vi } from 'vitest';

const {
  dataUrlToBlobMock,
  deleteScenarioAssetMock,
  deleteScenarioExportMock,
  deleteScenarioProjectMock,
  getScenarioAssetMock,
  getScenarioProjectMock,
  listScenarioAssetsMock,
  listScenarioExportsMock,
  listScenarioProjectsMock,
  measureImageBlobMock,
  saveScenarioAssetMock,
  saveScenarioExportMock,
  saveScenarioProjectMock,
  persistScenarioCaptureArtifactsMock,
  saveScenarioStepEditorDocumentRecordMock,
} = vi.hoisted(() => ({
  dataUrlToBlobMock: vi.fn(),
  deleteScenarioAssetMock: vi.fn(),
  deleteScenarioExportMock: vi.fn(),
  deleteScenarioProjectMock: vi.fn(),
  getScenarioAssetMock: vi.fn(),
  getScenarioProjectMock: vi.fn(),
  listScenarioAssetsMock: vi.fn(),
  listScenarioExportsMock: vi.fn(),
  listScenarioProjectsMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  persistScenarioCaptureArtifactsMock: vi.fn(),
  saveScenarioAssetMock: vi.fn(),
  saveScenarioExportMock: vi.fn(),
  saveScenarioProjectMock: vi.fn(),
  saveScenarioStepEditorDocumentRecordMock: vi.fn(),
}));

vi.mock('../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('../projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../projects')>();
  return {
    ...actual,
    deleteScenarioAsset: deleteScenarioAssetMock,
    deleteScenarioExport: deleteScenarioExportMock,
    deleteScenarioProject: deleteScenarioProjectMock,
    getScenarioAsset: getScenarioAssetMock,
    getScenarioProject: getScenarioProjectMock,
    listScenarioAssets: listScenarioAssetsMock,
    listScenarioExports: listScenarioExportsMock,
    listScenarioProjects: listScenarioProjectsMock,
    saveScenarioAsset: saveScenarioAssetMock,
    saveScenarioExport: saveScenarioExportMock,
    saveScenarioProject: saveScenarioProjectMock,
  };
});

vi.mock('./step-editor-documents/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./step-editor-documents/index')>();
  return {
    ...actual,
    saveScenarioStepEditorDocumentRecord: saveScenarioStepEditorDocumentRecordMock,
  };
});

vi.mock('./capture-step/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./capture-step/assets')>();
  return {
    ...actual,
    persistScenarioCaptureArtifacts: persistScenarioCaptureArtifactsMock,
  };
});
import { getScenarioAssetBlob, getScenarioAssetEntry } from './project-records/assets';
import { listScenarioExportRecords, saveScenarioExportRecord } from './project-records/exports';
import { recordScenarioSuggestedEvent } from './suggested-events';
import { saveScenarioCaptureStepToProject } from './capture-step';
import { createScenarioCaptureStep } from '../../../../features/scenario/project/public';
import { createScenarioStoreProjectFixture } from './test.helpers.ts';

type SaveCaptureRequest = Parameters<typeof saveScenarioCaptureStepToProject>[0];

function createCaptureRequest(overrides: Partial<SaveCaptureRequest> = {}): SaveCaptureRequest {
  return {
    projectId: 'project-1',
    dataUrl: 'data:image/png;base64,1',
    captureSurface: 'visible',
    sourceKind: 'manual',
    page: {
      title: null,
      url: null,
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    ...overrides,
  };
}

function createAutoClickCaptureRequest(projectId: string) {
  return createCaptureRequest({
    projectId,
    galleryAssetId: 'gallery-asset-1',
    sourceKind: 'auto-click',
    page: {
      title: 'Example',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      scrollX: 0,
      scrollY: 120,
      devicePixelRatio: 1,
    },
    target: {
      selector: '#submit',
      iframeSelector: null,
      tagName: 'button',
      role: 'button',
      text: 'Submit',
      ariaLabel: null,
      title: null,
      rect: { x: 10, y: 20, width: 120, height: 40 },
      framePadding: { top: 4, left: 6, right: 8, bottom: 10 },
    },
    interactionPoint: { x: 16, y: 24 },
    cursorPoint: { x: 18, y: 28 },
    title: 'Click Submit',
    body: 'This opens the export flow.',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  dataUrlToBlobMock.mockResolvedValue(new Blob(['pixel'], { type: 'image/png' }));
  measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
  listScenarioProjectsMock.mockResolvedValue([]);
  saveScenarioProjectMock.mockResolvedValue(undefined);
  saveScenarioAssetMock.mockResolvedValue(undefined);
  saveScenarioExportMock.mockResolvedValue(undefined);
  persistScenarioCaptureArtifactsMock.mockResolvedValue(undefined);
  saveScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
  deleteScenarioAssetMock.mockResolvedValue(undefined);
  deleteScenarioExportMock.mockResolvedValue(undefined);
  deleteScenarioProjectMock.mockResolvedValue(undefined);
  getScenarioAssetMock.mockResolvedValue(undefined);
  getScenarioProjectMock.mockResolvedValue(undefined);
  listScenarioAssetsMock.mockResolvedValue([]);
});

it('persists immutable scenario assets and appends capture overlays to the project step list', async () => {
  const project = createScenarioStoreProjectFixture();
  getScenarioProjectMock.mockResolvedValue(project);

  const result = await saveScenarioCaptureStepToProject(createAutoClickCaptureRequest(project.id));

  expect(project.steps).toHaveLength(0);
  expect(persistScenarioCaptureArtifactsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      assetEntry: expect.objectContaining({
        galleryAssetId: 'gallery-asset-1',
        mimeType: 'image/png',
        projectId: 'project-1',
        width: 1440,
        height: 900,
      }),
      project: expect.objectContaining({
        id: 'project-1',
        steps: [expect.objectContaining({ kind: 'capture', title: 'Click Submit' })],
      }),
      projectId: 'project-1',
      stepDocument: expect.any(Object),
    })
  );
  expect(result.asset.galleryAssetId).toBe('gallery-asset-1');
  expect(result.step.assetId).toBe(result.asset.id);
  expect(result.step.overlays.map((overlay) => overlay.kind)).toEqual(['focus-rect']);
  expect(result.step.annotationRenderMode).toBe('overlays');
  expect(result.step.viewportTransform).toEqual({ x: 0, y: 0, width: 720, height: 420 });
  expect(persistScenarioCaptureArtifactsMock).toHaveBeenCalledWith(
    expect.objectContaining({ stepId: result.step.id })
  );
});

it('records suggested events near the latest step and sorts export history by recency', async () => {
  const project = {
    ...createScenarioStoreProjectFixture(),
    steps: [createScenarioCaptureStep({ assetId: 'asset-1', title: 'Latest step' })],
  };
  getScenarioProjectMock.mockResolvedValue(project);
  listScenarioExportsMock.mockResolvedValue([
    {
      id: 'export-1',
      projectId: 'project-1',
      format: 'html',
      filename: 'older.html',
      createdAt: 10,
      size: 100,
    },
    {
      id: 'export-2',
      projectId: 'project-1',
      format: 'markdown',
      filename: 'newer.zip',
      createdAt: 20,
      size: 200,
    },
  ]);

  const event = await recordScenarioSuggestedEvent({
    projectId: 'project-1',
    kind: 'keydown',
    message: 'Shortcut: Ctrl+S',
  });
  const exports = await listScenarioExportRecords('project-1');

  expect(event.sourceStepId).toBe(project.steps[0]?.id);
  expect(saveScenarioProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      suggestedEvents: [expect.objectContaining({ kind: 'keydown', message: 'Shortcut: Ctrl+S' })],
    }),
    { baseUpdatedAt: project.updatedAt }
  );
  expect(exports.map((entry) => entry.id)).toEqual(['export-2', 'export-1']);
});

it('stores export audit entries and throws when a scenario project is missing', async () => {
  getScenarioProjectMock.mockResolvedValueOnce(undefined);
  getScenarioProjectMock.mockResolvedValueOnce(undefined);

  await expect(
    saveScenarioCaptureStepToProject(
      createCaptureRequest({
        projectId: 'missing',
        page: {
          title: null,
          url: null,
          viewport: { x: 0, y: 0, width: 1, height: 1 },
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
        },
      })
    )
  ).rejects.toThrow('Scenario project not found: missing');
  await expect(
    recordScenarioSuggestedEvent({
      projectId: 'missing',
      kind: 'scroll',
      message: 'Scrolled',
    })
  ).rejects.toThrow('Scenario project not found: missing');

  expect(
    await saveScenarioExportRecord({
      projectId: 'project-1',
      format: 'html',
      filename: 'scenario.html',
      size: 1024,
    })
  ).toEqual(
    expect.objectContaining({
      projectId: 'project-1',
      format: 'html',
      filename: 'scenario.html',
      size: 1024,
    })
  );
  expect(saveScenarioExportMock).toHaveBeenCalledTimes(1);
});

it('returns undefined asset lookups and supports capture steps without derived overlays', async () => {
  getScenarioAssetMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
  getScenarioProjectMock.mockResolvedValueOnce(createScenarioStoreProjectFixture());

  await expect(getScenarioAssetBlob('missing-asset')).resolves.toBeUndefined();
  await expect(getScenarioAssetEntry('missing-asset')).resolves.toBeUndefined();
  const result = await saveScenarioCaptureStepToProject(
    createCaptureRequest({
      captureSurface: 'full',
    })
  );

  expect(result.step.overlays).toEqual([]);
  expect(saveScenarioStepEditorDocumentRecordMock).not.toHaveBeenCalled();
});
