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

import {
  createScenarioStoreProjectFixture,
  createCapturedGuideStepFixture,
} from '../test.helpers.ts';
import { listRecentScenarioSteps, listScenarioPreviewSteps } from './project-step-queries';

beforeEach(() => {
  vi.clearAllMocks();
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,preview');
  getScenarioProjectMock.mockResolvedValue(undefined);
  getScenarioAssetBlobMock.mockResolvedValue(undefined);
});

describe('project step queries', () => {
  it('uses captured image assets for recent steps and preserves document order in library previews', async () => {
    const first = createCapturedGuideStepFixture('asset-1', 'First');
    const second = createCapturedGuideStepFixture('asset-2', 'Second');
    const project = { ...createScenarioStoreProjectFixture(), items: [first, second] };
    getScenarioProjectMock.mockResolvedValue(project);
    getScenarioAssetBlobMock.mockResolvedValue(new Blob(['asset'], { type: 'image/png' }));
    expect(await listRecentScenarioSteps(project.id, 1)).toEqual([
      expect.objectContaining({
        id: second.id,
        title: 'Second',
        position: 1,
        numberLabel: '2',
        previewDataUrl: 'data:image/png;base64,preview',
      }),
    ]);
    expect(getScenarioAssetBlobMock).toHaveBeenCalledWith('asset-2');
    expect((await listScenarioPreviewSteps(project.id)).map((step) => step.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('returns empty results without reading assets for missing projects', async () => {
    await expect(listRecentScenarioSteps('missing')).resolves.toEqual([]);
    await expect(listScenarioPreviewSteps('missing')).resolves.toEqual([]);
    expect(getScenarioAssetBlobMock).not.toHaveBeenCalled();
  });

  it('propagates unavailable project failures instead of presenting an empty guide', async () => {
    getScenarioProjectMock.mockRejectedValue(new Error('unavailable'));
    await expect(listScenarioPreviewSteps('old')).rejects.toThrow('unavailable');
    expect(getScenarioAssetBlobMock).not.toHaveBeenCalled();
  });
});
