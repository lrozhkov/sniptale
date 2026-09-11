import { beforeEach, expect, it, vi } from 'vitest';

import {
  createGuideProject,
  createGuideStep,
  createGuideImageBlock,
} from '../../../features/scenario/project/public';
const { blobToDataUrlMock, getScenarioAssetMock, getScenarioProjectMock } = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  getScenarioAssetMock: vi.fn(),
  getScenarioProjectMock: vi.fn(),
}));
vi.mock('../../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/projects')>()),
  getScenarioAsset: getScenarioAssetMock,
  getScenarioProject: getScenarioProjectMock,
}));
vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

import { buildScenarioProjectStepPayload } from './step-payload';

beforeEach(() => {
  vi.clearAllMocks();
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  getScenarioAssetMock.mockResolvedValue(createScenarioAssetEntry());
});

function projectWithCapture() {
  const project = createGuideProject('Guide', 'project-1');
  const step = createGuideStep('Captured step', 'capture-1');
  step.blocks.push(
    createGuideImageBlock({
      id: 'image-1',
      assetId: 'asset-1',
      width: 100,
      height: 50,
      source: {
        kind: 'capture',
        captureSurface: 'visible',
        sourceKind: 'manual',
        page: {
          title: null,
          url: null,
          viewport: { x: 0, y: 0, width: 100, height: 50 },
          scrollX: 0,
          scrollY: 0,
          devicePixelRatio: 1,
        },
        target: null,
        cursorPoint: null,
        interactionPoint: null,
        captureMetadata: { pointerRange: null, scroll: null, trigger: 'pointer-up' },
      },
    })
  );
  project.items = [createGuideStep('Introduction', 'intro'), step];
  return project;
}

it('builds capture session previews from the canonical guide and durable image bytes', async () => {
  getScenarioProjectMock.mockResolvedValue(projectWithCapture());
  expect(await buildScenarioProjectStepPayload('project-1')).toEqual({
    recentSteps: [
      expect.objectContaining({
        id: 'capture-1',
        position: 1,
        stepNumber: 2,
        title: 'Captured step',
        previewDataUrl: 'data:image/png;base64,preview',
        metadata: expect.objectContaining({ captureSurface: 'visible', sourceKind: 'manual' }),
      }),
    ],
  });
});

it('returns empty previews for absent selection, missing project and missing image', async () => {
  expect(await buildScenarioProjectStepPayload(null)).toEqual({ recentSteps: [] });
  getScenarioProjectMock.mockResolvedValue(undefined);
  expect(await buildScenarioProjectStepPayload('missing')).toEqual({ recentSteps: [] });
  getScenarioProjectMock.mockResolvedValue(projectWithCapture());
  getScenarioAssetMock.mockResolvedValue(undefined);
  expect(await buildScenarioProjectStepPayload('project-1')).toEqual({ recentSteps: [] });
});

it('retains the image MIME type when stored bytes have an empty Blob type', async () => {
  getScenarioProjectMock.mockResolvedValue(projectWithCapture());
  getScenarioAssetMock.mockResolvedValue(
    createScenarioAssetEntry({ file: new File(['asset'], 'asset-1'), mimeType: 'image/png' })
  );
  blobToDataUrlMock.mockImplementation(async (blob: Blob) => `data:${blob.type};base64,preview`);
  expect(await buildScenarioProjectStepPayload('project-1')).toEqual({
    recentSteps: [expect.objectContaining({ previewDataUrl: 'data:image/png;base64,preview' })],
  });
});

function createScenarioAssetEntry(
  overrides: Partial<{
    file: File;
    mimeType: string;
  }> = {}
) {
  const file = overrides.file ?? new File(['asset'], 'asset-1', { type: 'image/png' });
  return {
    assetId: 'opfs-asset-1',
    file,
    createdAt: 10,
    galleryAssetId: null,
    height: 1,
    id: 'asset-1',
    mimeType: overrides.mimeType ?? file.type,
    projectId: 'project-1',
    size: file.size,
    width: 1,
  };
}
