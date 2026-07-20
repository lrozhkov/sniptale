import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BROWSER_FRAME_STATE,
  DEFAULT_EDITOR_FRAME_SETTINGS,
} from '../../features/editor/document/constants';
import { createScenarioCaptureStep } from '../../features/scenario/project/public';
import { type ScenarioCaptureStep } from '../../features/scenario/contracts/types/project';

const { dataUrlToBlobMock, deleteScenarioAssetMock, measureImageBlobMock, saveScenarioAssetMock } =
  vi.hoisted(() => ({
    dataUrlToBlobMock: vi.fn(),
    deleteScenarioAssetMock: vi.fn(),
    measureImageBlobMock: vi.fn(),
    saveScenarioAssetMock: vi.fn(),
  }));

vi.mock('../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/scenario/projects')>()),
  deleteScenarioAsset: deleteScenarioAssetMock,
  saveScenarioAsset: saveScenarioAssetMock,
}));

vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

import {
  buildScenarioEditedCaptureStep,
  createScenarioEditedCaptureAsset,
  deleteScenarioEditedCaptureAsset,
} from './edits';

function createEditorDocument() {
  return {
    version: 1 as const,
    sourceImageData: 'data:image/png;base64,doc',
    sourceName: null,
    sourceWidth: 320,
    sourceHeight: 180,
    canvasWidth: 320,
    canvasHeight: 180,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 320,
    sourceDisplayHeight: 180,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    browserFrame: DEFAULT_BROWSER_FRAME_STATE,
    canvasJson: '{"version":"7.2.0","objects":[]}',
  };
}

function registerCaptureStepEditsScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(123);
    dataUrlToBlobMock.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
    deleteScenarioAssetMock.mockResolvedValue(undefined);
    saveScenarioAssetMock.mockResolvedValue(undefined);
  });
}

async function verifiesEditedAssetCreation() {
  const asset = await createScenarioEditedCaptureAsset({
    dataUrl: 'data:image/png;base64,abc',
    galleryAssetId: 'gallery-1',
    projectId: 'project-1',
  });

  expect(dataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,abc');
  expect(saveScenarioAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      createdAt: 123,
      size: 5,
    })
  );
  expect(asset).toEqual(
    expect.objectContaining({
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      createdAt: 123,
      size: 5,
    })
  );
}

async function verifiesFallbackAssetMetadata() {
  dataUrlToBlobMock.mockResolvedValue(new Blob(['fallback']));

  const asset = await createScenarioEditedCaptureAsset({
    dataUrl: 'data:image/png;base64,fallback',
    projectId: 'project-2',
  });

  expect(saveScenarioAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      projectId: 'project-2',
      galleryAssetId: null,
      mimeType: 'image/png',
    })
  );
  expect(asset).toEqual(
    expect.objectContaining({
      projectId: 'project-2',
      galleryAssetId: null,
      mimeType: 'image/png',
    })
  );
}

function verifiesEditedCaptureStepReset() {
  vi.spyOn(Date, 'now').mockReturnValue(456);
  const document = createEditorDocument();
  const step: ScenarioCaptureStep = {
    ...createScenarioCaptureStep({
      assetId: 'asset-old',
    }),
    imageTransform: { scale: 1.4, x: 48, y: 24 },
    overlays: [
      {
        id: 'overlay-1',
        kind: 'text',
        point: { x: 10, y: 20 },
        text: 'Overlay',
        color: '#000000',
        fontFamily: 'system-ui',
        fontSize: 14,
        fontWeight: 400,
      },
    ],
    viewportTransform: { x: 1, y: 2, width: 3, height: 4 },
  };

  expect(buildScenarioEditedCaptureStep(step, 'asset-new', document)).toEqual(
    expect.objectContaining({
      id: step.id,
      assetId: 'asset-new',
      annotationRenderMode: 'asset',
      overlays: [],
      imageTransform: { scale: 1, x: 0, y: 0 },
      viewportTransform: {
        x: 0,
        y: 0,
        width: 720,
        height: 420,
      },
      updatedAt: 456,
    })
  );
}

async function verifiesEditedAssetDeletion() {
  await deleteScenarioEditedCaptureAsset('asset-edited');

  expect(deleteScenarioAssetMock).toHaveBeenCalledWith('asset-edited');
}

function runCaptureStepEditsSuite() {
  registerCaptureStepEditsScope();

  it(
    'creates a new immutable scenario asset entry from the editor data url',
    verifiesEditedAssetCreation
  );
  it(
    'falls back to canonical metadata when the edited blob has no mime type or gallery asset',
    verifiesFallbackAssetMetadata
  );
  it(
    'repoints the capture step to the new asset and resets editor-owned transforms',
    verifiesEditedCaptureStepReset
  );
  it('deletes edited assets through the capture-step edit seam', verifiesEditedAssetDeletion);
}

describe('capture step edits', runCaptureStepEditsSuite);
