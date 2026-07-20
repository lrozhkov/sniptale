import { beforeEach, expect, it, vi } from 'vitest';

const { blobToDataUrlMock, getScenarioAssetMock, getScenarioProjectRecordV3Mock } = vi.hoisted(
  () => ({
    blobToDataUrlMock: vi.fn(),
    getScenarioAssetMock: vi.fn(),
    getScenarioProjectRecordV3Mock: vi.fn(),
  })
);

vi.mock('../../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/projects')>()),
  getScenarioAsset: getScenarioAssetMock,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('../../../composition/persistence/scenario/store/v3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/store/v3')>()),
  getScenarioProjectRecordV3: getScenarioProjectRecordV3Mock,
}));

import { buildScenarioProjectStepPayload } from './step-payload';

beforeEach(() => {
  vi.clearAllMocks();
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  getScenarioAssetMock.mockResolvedValue(createScenarioAssetEntry());
});

it('loads recent and trashed v3 capture slides for recorder sidebar session payloads', async () => {
  getScenarioProjectRecordV3Mock.mockResolvedValue({
    id: 'project-1',
    slides: [createManualSlide('intro'), createCaptureSlide('capture-1')],
    trash: [createTrashedSlide('old-capture')],
  });

  await expect(buildScenarioProjectStepPayload('project-1')).resolves.toEqual({
    recentSteps: [
      expect.objectContaining({
        id: 'capture-1',
        metadata: expect.objectContaining({
          captureSurface: 'visible',
          sourceKind: 'manual',
        }),
        position: 1,
        previewDataUrl: 'data:image/png;base64,preview',
        title: 'Captured step',
      }),
    ],
    trashedSteps: [
      expect.objectContaining({
        id: 'old-capture',
        kind: 'capture',
        originalIndex: 0,
        title: 'Trashed step',
      }),
    ],
  });
});

it('returns empty steps when the active project or capture asset is missing', async () => {
  await expect(buildScenarioProjectStepPayload(null)).resolves.toEqual({
    recentSteps: [],
    trashedSteps: [],
  });

  getScenarioProjectRecordV3Mock.mockResolvedValue(null);
  await expect(buildScenarioProjectStepPayload('missing')).resolves.toEqual({
    recentSteps: [],
    trashedSteps: [],
  });

  getScenarioProjectRecordV3Mock.mockResolvedValue({
    id: 'project-1',
    slides: [createCaptureSlide('capture-1')],
    trash: [],
  });
  getScenarioAssetMock.mockResolvedValue(null);
  await expect(buildScenarioProjectStepPayload('project-1')).resolves.toEqual({
    recentSteps: [],
    trashedSteps: [],
  });
});

it('normalizes legacy capture source values and fallback titles in v3 step payloads', async () => {
  getScenarioProjectRecordV3Mock.mockResolvedValue({
    id: 'project-1',
    slides: [
      {
        ...createCaptureSlide('capture-1'),
        notes: 'Fallback note',
        source: {
          ...createCaptureSlide('capture-1').source,
          captureSurface: null,
          sourceKind: null,
        },
        title: '',
      },
    ],
    trash: [
      {
        deletedAt: 30,
        originalIndex: 1,
        slide: createManualSlide('manual-old'),
      },
    ],
  });

  await expect(buildScenarioProjectStepPayload('project-1')).resolves.toEqual({
    recentSteps: [
      expect.objectContaining({
        metadata: expect.objectContaining({
          captureSurface: 'visible',
          sourceKind: 'manual',
        }),
        title: 'Fallback note',
      }),
    ],
    trashedSteps: [
      expect.objectContaining({
        id: 'manual-old',
        kind: 'note',
        title: 'Manual slide',
      }),
    ],
  });
});

it('restores preview data URL MIME from asset metadata when the stored Blob type is empty', async () => {
  getScenarioProjectRecordV3Mock.mockResolvedValue({
    id: 'project-1',
    slides: [createCaptureSlide('capture-1')],
    trash: [],
  });
  getScenarioAssetMock.mockResolvedValue(
    createScenarioAssetEntry({
      blob: new Blob(['asset']),
      mimeType: 'image/png',
    })
  );
  blobToDataUrlMock.mockImplementation(async (blob: Blob) => `data:${blob.type};base64,preview`);

  await expect(buildScenarioProjectStepPayload('project-1')).resolves.toEqual({
    recentSteps: [
      expect.objectContaining({
        previewDataUrl: 'data:image/png;base64,preview',
      }),
    ],
    trashedSteps: [],
  });
});

function createScenarioAssetEntry(
  overrides: Partial<{
    blob: Blob;
    mimeType: string;
  }> = {}
) {
  const blob = overrides.blob ?? new Blob(['asset'], { type: 'image/png' });
  return {
    blob,
    createdAt: 10,
    galleryAssetId: null,
    height: 1,
    id: 'asset-1',
    mimeType: overrides.mimeType ?? blob.type,
    projectId: 'project-1',
    size: blob.size,
    width: 1,
  };
}

function createCaptureSlide(id: string) {
  return {
    id,
    notes: '',
    source: {
      assetId: 'asset-1',
      captureMetadata: {
        pointerRange: null,
        scroll: null,
        trigger: 'pointer-up',
      },
      captureSurface: 'visible',
      cursorPoint: null,
      galleryAssetId: null,
      interactionPoint: null,
      kind: 'capture',
      page: {
        devicePixelRatio: 1,
        scrollX: 0,
        scrollY: 0,
        title: 'Page',
        url: 'https://example.com',
        viewport: { height: 800, width: 1000, x: 0, y: 0 },
      },
      sourceKind: 'manual',
      target: null,
    },
    title: 'Captured step',
  };
}

function createManualSlide(id: string) {
  return {
    id,
    notes: '',
    source: { kind: 'manual' },
    title: 'Manual slide',
  };
}

function createTrashedSlide(id: string) {
  return {
    deletedAt: 20,
    originalIndex: 0,
    slide: {
      ...createCaptureSlide(id),
      title: 'Trashed step',
    },
  };
}
