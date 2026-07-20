import { beforeEach, describe, expect, it, vi } from 'vitest';

const { blobToDataUrlMock, getScenarioAssetBlobMock, getScenarioProjectMock } = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  getScenarioAssetBlobMock: vi.fn(),
  getScenarioProjectMock: vi.fn(),
}));

vi.mock('../../../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

vi.mock('../../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../projects')>()),
  getScenarioProject: getScenarioProjectMock,
}));

vi.mock('../project-records/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../project-records/assets')>()),
  getScenarioAssetBlob: getScenarioAssetBlobMock,
}));

import { createScenarioCaptureStep } from '../../../../../features/scenario/project/public';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';
import { listRecentScenarioSteps, listScenarioTrashedSteps } from './project-step-queries';

beforeEach(() => {
  vi.clearAllMocks();
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  getScenarioProjectMock.mockResolvedValue(undefined);
  getScenarioAssetBlobMock.mockResolvedValue(undefined);
});

async function verifyRecentAndTrashedQueries() {
  const assetBlob = new Blob(['asset'], { type: 'image/png' });
  const firstStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'First' });
  const secondStep = createScenarioCaptureStep({ assetId: 'asset-2', title: 'Second' });
  const project = {
    ...createScenarioStoreProjectFixture(),
    steps: [firstStep, secondStep],
    trash: [
      {
        deletedAt: 30,
        originalIndex: 0,
        step: firstStep,
      },
    ],
  };
  getScenarioProjectMock.mockResolvedValue(project);
  getScenarioAssetBlobMock.mockResolvedValue(assetBlob);

  const recentSteps = await listRecentScenarioSteps(project.id, 1);
  const trashedSteps = await listScenarioTrashedSteps(project.id);

  expect(getScenarioAssetBlobMock).toHaveBeenCalledWith(secondStep.assetId);
  expect(recentSteps).toEqual([
    expect.objectContaining({
      id: secondStep.id,
      title: 'Second',
      previewDataUrl: 'data:image/png;base64,preview',
    }),
  ]);
  expect(trashedSteps).toEqual([
    {
      id: firstStep.id,
      deletedAt: 30,
      kind: 'capture',
      originalIndex: 0,
      title: 'First',
    },
  ]);
}

async function verifyMissingProjectQueries() {
  getScenarioProjectMock.mockResolvedValue(undefined);

  await expect(listRecentScenarioSteps('missing')).resolves.toEqual([]);
  await expect(listScenarioTrashedSteps('missing')).resolves.toEqual([]);
  expect(getScenarioAssetBlobMock).not.toHaveBeenCalled();
}

describe('project step queries', () => {
  it(
    'loads recent and trashed scenario step projections from the project owner',
    verifyRecentAndTrashedQueries
  );
  it('keeps missing-project queries as empty results', verifyMissingProjectQueries);
});
