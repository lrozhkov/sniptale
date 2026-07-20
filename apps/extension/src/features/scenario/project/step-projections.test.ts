import { expect, it, vi } from 'vitest';
import { type ScenarioProject } from '../contracts/types/project';
import { buildRecentScenarioSteps, buildTrashedScenarioSteps } from './step-projections';
import { createScenarioCaptureStep, createScenarioSectionStep } from './public';

const { blobToDataUrlMock } = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

function createScenarioProjectFixture(): ScenarioProject {
  return {
    version: 2,
    id: 'project-1',
    name: 'Scenario',
    createdAt: 1,
    updatedAt: 2,
    trash: [],
    suggestedEvents: [],
    steps: [
      createScenarioSectionStep({ title: 'Intro' }),
      createScenarioCaptureStep({ assetId: 'asset-1', title: 'First capture' }),
      createScenarioCaptureStep({ assetId: 'asset-2', body: 'Second capture' }),
    ],
  };
}

function createAssetBlobResolver() {
  return async (assetId: string) => (assetId === 'asset-1' ? new Blob(['1']) : undefined);
}

it('builds recent capture steps and skips assets that cannot be resolved', async () => {
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  const project = createScenarioProjectFixture();

  const recentSteps = await buildRecentScenarioSteps({
    getAssetBlob: createAssetBlobResolver(),
    limit: 5,
    project,
  });

  expect(recentSteps).toEqual([
    expect.objectContaining({
      id: project.steps[1]!.id,
      metadata: expect.objectContaining({
        captureSurface: 'visible',
        sourceKind: 'manual',
      }),
      position: 1,
      previewDataUrl: 'data:image/png;base64,preview',
      title: 'First capture',
    }),
  ]);
});

it('falls back to step body and step id when recent-step titles are missing', async () => {
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  const untitledCapture = createScenarioCaptureStep({ assetId: 'asset-3' });
  const subtitledCapture = createScenarioCaptureStep({
    assetId: 'asset-4',
    body: 'Fallback body',
  });

  const recentSteps = await buildRecentScenarioSteps({
    getAssetBlob: async () => new Blob(['1']),
    project: {
      ...createScenarioProjectFixture(),
      steps: [untitledCapture, subtitledCapture],
    },
  });

  expect(recentSteps).toEqual([
    expect.objectContaining({
      id: subtitledCapture.id,
      metadata: expect.objectContaining({
        captureSurface: 'visible',
        sourceKind: 'manual',
      }),
      position: 1,
      previewDataUrl: 'data:image/png;base64,preview',
      title: 'Fallback body',
    }),
    expect.objectContaining({
      id: untitledCapture.id,
      metadata: expect.objectContaining({
        captureSurface: 'visible',
        sourceKind: 'manual',
      }),
      position: 0,
      previewDataUrl: 'data:image/png;base64,preview',
      title: untitledCapture.id,
    }),
  ]);
});

it('builds trashed scenario step summaries with fallback titles', () => {
  const firstStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'First capture' });
  const secondStep = createScenarioCaptureStep({ assetId: 'asset-2' });
  const project = {
    ...createScenarioProjectFixture(),
    trash: [
      {
        deletedAt: 30,
        originalIndex: 0,
        step: firstStep,
      },
      {
        deletedAt: 40,
        originalIndex: 1,
        step: secondStep,
      },
    ],
  };

  expect(buildTrashedScenarioSteps(project)).toEqual([
    {
      id: firstStep.id,
      deletedAt: 30,
      kind: 'capture',
      originalIndex: 0,
      title: 'First capture',
    },
    {
      id: secondStep.id,
      deletedAt: 40,
      kind: 'capture',
      originalIndex: 1,
      title: secondStep.id,
    },
  ]);
});
