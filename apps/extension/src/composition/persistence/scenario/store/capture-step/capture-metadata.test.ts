import { beforeEach, expect, it, vi } from 'vitest';

const {
  dataUrlToBlobMock,
  getScenarioProjectMock,
  measureImageBlobMock,
  persistScenarioCaptureArtifactsMock,
  saveScenarioAssetMock,
  saveScenarioProjectMock,
  saveScenarioStepEditorDocumentRecordMock,
} = vi.hoisted(() => ({
  dataUrlToBlobMock: vi.fn(),
  getScenarioProjectMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  persistScenarioCaptureArtifactsMock: vi.fn(),
  saveScenarioAssetMock: vi.fn(),
  saveScenarioProjectMock: vi.fn(),
  saveScenarioStepEditorDocumentRecordMock: vi.fn(),
}));

vi.mock('../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

vi.mock('../../projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../projects')>();
  return {
    ...actual,
    getScenarioProject: getScenarioProjectMock,
    saveScenarioAsset: saveScenarioAssetMock,
    saveScenarioProject: saveScenarioProjectMock,
  };
});

vi.mock('../step-editor-documents/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../step-editor-documents/index')>();
  return {
    ...actual,
    saveScenarioStepEditorDocumentRecord: saveScenarioStepEditorDocumentRecordMock,
  };
});

vi.mock('./assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./assets')>();
  return {
    ...actual,
    persistScenarioCaptureArtifacts: persistScenarioCaptureArtifactsMock,
  };
});
import { saveScenarioCaptureStepToProject } from './index';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';

beforeEach(() => {
  vi.clearAllMocks();
  dataUrlToBlobMock.mockResolvedValue(new Blob(['pixel'], { type: 'image/png' }));
  measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
  persistScenarioCaptureArtifactsMock.mockImplementation(async (args) => args.project);
  saveScenarioAssetMock.mockResolvedValue(undefined);
  saveScenarioProjectMock.mockResolvedValue(undefined);
  saveScenarioStepEditorDocumentRecordMock.mockResolvedValue(undefined);
});

function createClickCaptureRequest() {
  return {
    projectId: 'project-1',
    dataUrl: 'data:image/png;base64,1',
    captureSurface: 'visible' as const,
    sourceKind: 'auto-click' as const,
    page: {
      title: null,
      url: null,
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    interactionPoint: { x: 25, y: 35 },
    cursorPoint: { x: 26, y: 36 },
    captureMetadata: {
      pointerRange: {
        start: { x: 20, y: 30 },
        end: { x: 25, y: 35 },
        minX: 20,
        minY: 30,
        maxX: 25,
        maxY: 35,
        distance: 7,
        durationMs: 180,
      },
      scroll: {
        startX: 0,
        startY: 100,
        endX: 0,
        endY: 160,
        deltaX: 0,
        deltaY: 60,
      },
      trigger: 'pointer-up' as const,
    },
  };
}

async function verifyClickCaptureMetadataScenario() {
  getScenarioProjectMock.mockResolvedValueOnce(createScenarioStoreProjectFixture());

  const result = await saveScenarioCaptureStepToProject(createClickCaptureRequest());

  expect(result.step.captureMetadata).toEqual(
    expect.objectContaining({
      trigger: 'pointer-up',
      scroll: expect.objectContaining({ deltaY: 60 }),
    })
  );
  expect(result.step.overlays.map((overlay) => overlay.kind)).toEqual(['click-ring']);
  expect(persistScenarioCaptureArtifactsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      baseUpdatedAt: expect.any(Number),
      project: expect.objectContaining({ id: 'project-1' }),
      projectId: 'project-1',
      stepId: result.step.id,
      stepDocument: expect.any(Object),
    })
  );
}

it(
  'stores click capture metadata and derives click overlays when no focus target exists',
  verifyClickCaptureMetadataScenario
);
