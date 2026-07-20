import { beforeEach, expect, it, vi } from 'vitest';

const {
  dataUrlToBlobMock,
  deleteScenarioAssetMock,
  getScenarioProjectRecordV3Mock,
  measureImageBlobMock,
  saveScenarioAssetMock,
  saveScenarioProjectRecordV3Mock,
} = vi.hoisted(() => ({
  dataUrlToBlobMock: vi.fn(),
  deleteScenarioAssetMock: vi.fn(),
  getScenarioProjectRecordV3Mock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  saveScenarioAssetMock: vi.fn(),
  saveScenarioProjectRecordV3Mock: vi.fn(),
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
    deleteScenarioAsset: deleteScenarioAssetMock,
    saveScenarioAsset: saveScenarioAssetMock,
  };
});

vi.mock('./project-records', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./project-records')>();
  return {
    ...actual,
    getScenarioProjectRecordV3: getScenarioProjectRecordV3Mock,
    saveScenarioProjectRecordV3: saveScenarioProjectRecordV3Mock,
  };
});

import { createScenarioProjectV3 } from '../../../../../features/scenario/project/v3';
import { saveScenarioCaptureSlideToProject } from './capture';
import type { ScenarioCaptureSlideSaveArgs } from './capture';

beforeEach(() => {
  vi.clearAllMocks();
  dataUrlToBlobMock.mockResolvedValue(new Blob(['pixel'], { type: 'image/png' }));
  deleteScenarioAssetMock.mockResolvedValue(undefined);
  measureImageBlobMock.mockResolvedValue({ height: 900, width: 1440 });
  saveScenarioAssetMock.mockResolvedValue(undefined);
  saveScenarioProjectRecordV3Mock.mockImplementation(async (project) => project);
});

it('turns recorder capture metadata into a v3 presentation slide', async () => {
  const project = createScenarioProjectV3('Recorded deck');
  getScenarioProjectRecordV3Mock.mockResolvedValue(project);

  const result = await saveScenarioCaptureSlideToProject(createCaptureSaveArgs(project.id));

  expect(result.slide).toEqual(
    expect.objectContaining({
      notes: 'Click the submit button',
      source: expect.objectContaining({ kind: 'capture', galleryAssetId: 'gallery-1' }),
      title: 'Submit order',
    })
  );
  expect(result.slide.guide).toEqual(
    expect.objectContaining({ body: 'Click the submit button', targetSummary: 'Submit order' })
  );
  expect(result.slide.clicks).toEqual({ count: 1, initialIndex: 1 });
  expect(result.slide.layout.layoutId).toBe('step-guide');
  expect(result.slide.elements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'image',
        role: 'main-image',
        stylePresetId: 'main-screenshot',
      }),
      expect.objectContaining({ kind: 'shape', role: 'target-highlight' }),
      expect.objectContaining({
        build: expect.objectContaining({ showAtClick: 1 }),
        kind: 'shape',
        role: 'click-marker',
      }),
      expect.objectContaining({ kind: 'callout', role: 'step-note' }),
    ])
  );
  expect(saveScenarioProjectRecordV3Mock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: project.id,
      slides: [expect.objectContaining({ id: result.slide.id })],
    }),
    { baseUpdatedAt: project.updatedAt }
  );
});

it('creates a plain screenshot slide when capture annotations are absent', async () => {
  const project = createScenarioProjectV3('Recorded deck');
  getScenarioProjectRecordV3Mock.mockResolvedValue(project);
  const args = createCaptureSaveArgs(project.id);
  delete args.captureMetadata;
  delete args.galleryAssetId;
  delete args.title;

  const result = await saveScenarioCaptureSlideToProject({
    ...args,
    body: '',
    cursorPoint: null,
    interactionPoint: null,
    target: null,
  });

  expect(result.slide.clicks.count).toBe(0);
  expect(result.slide.source.kind).toBe('capture');
  if (result.slide.source.kind !== 'capture') {
    throw new Error('Expected capture slide source');
  }
  expect(result.slide.source.captureMetadata.trigger).toBe('pointer-up');
  expect(result.slide.source.galleryAssetId).toBeNull();
  expect(result.slide.title).toBe('Checkout');
  expect(result.slide.elements).toEqual([
    expect.objectContaining({ kind: 'image', role: 'main-image' }),
  ]);
  expect(result.slide.guide?.targetSummary).toBeNull();
});

it('fails explicitly when the capture project no longer exists', async () => {
  getScenarioProjectRecordV3Mock.mockResolvedValue(null);

  await expect(saveScenarioCaptureSlideToProject(createCaptureSaveArgs('missing'))).rejects.toThrow(
    'Scenario project not found: missing'
  );
  expect(saveScenarioAssetMock).not.toHaveBeenCalled();
});

it('rolls back the capture asset when the project write fails', async () => {
  const project = createScenarioProjectV3('Recorded deck');
  const writeError = new Error('project write failed');
  getScenarioProjectRecordV3Mock.mockResolvedValue(project);
  saveScenarioProjectRecordV3Mock.mockRejectedValueOnce(writeError);

  await expect(
    saveScenarioCaptureSlideToProject(createCaptureSaveArgs(project.id))
  ).rejects.toThrow('project write failed');
  expect(deleteScenarioAssetMock).toHaveBeenCalledWith(expect.any(String));
});

function createCaptureSaveArgs(projectId: string): ScenarioCaptureSlideSaveArgs {
  return {
    body: 'Click the submit button',
    captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
    captureSurface: 'visible',
    cursorPoint: { x: 430, y: 330 },
    dataUrl: 'data:image/png;base64,1',
    galleryAssetId: 'gallery-1',
    interactionPoint: { x: 420, y: 320 },
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      title: 'Checkout',
      url: 'https://example.test/checkout',
      viewport: { height: 900, width: 1440, x: 0, y: 0 },
    },
    projectId,
    sourceKind: 'auto-click',
    target: {
      ariaLabel: 'Submit order',
      framePadding: null,
      iframeSelector: null,
      rect: { height: 48, width: 160, x: 380, y: 296 },
      role: 'button',
      selector: '#submit',
      tagName: 'BUTTON',
      text: 'Submit',
      title: null,
    },
    title: 'Submit order',
  };
}
