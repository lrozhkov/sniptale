import { beforeEach, expect, it, vi } from 'vitest';

const { getAssetByIdMock, getProjectAssetMock, getRecordingMock } = vi.hoisted(() => ({
  getAssetByIdMock: vi.fn(),
  getProjectAssetMock: vi.fn(),
  getRecordingMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/projects/index')>()),

  getProjectAsset: getProjectAssetMock,
}));

vi.mock('../../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/recordings/index')
  >()),

  getRecording: getRecordingMock,
}));

vi.mock('../../../../features/video/project/timeline/basics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../features/video/project/timeline/basics')>()),

  getAssetById: getAssetByIdMock,
}));

import { loadBlobForAsset } from './load';

const PROJECT = { id: 'project-1' } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

it('loads blobs from project assets', async () => {
  const blob = new Blob(['asset']);

  getAssetByIdMock.mockReturnValue({
    source: { kind: 'project-asset', projectAssetId: 'asset-1' },
  });
  getProjectAssetMock.mockResolvedValue({ blob });

  await expect(loadBlobForAsset(PROJECT, 'asset-1')).resolves.toBe(blob);
  expect(getRecordingMock).not.toHaveBeenCalled();
});

it('rejects when the asset or its backing blob cannot be found', async () => {
  getAssetByIdMock.mockReturnValueOnce(null);

  await expect(loadBlobForAsset(PROJECT, 'missing-asset')).rejects.toThrow(
    'Asset missing-asset not found for offline audio mix.'
  );

  getAssetByIdMock.mockReturnValueOnce({
    source: { kind: 'project-asset', projectAssetId: 'asset-2' },
  });
  getProjectAssetMock.mockResolvedValueOnce(null);

  await expect(loadBlobForAsset(PROJECT, 'asset-2')).rejects.toThrow(
    'Project asset asset-2 not found.'
  );
});

it('rejects when a recording-backed asset is missing from storage', async () => {
  getAssetByIdMock.mockReturnValue({
    source: { kind: 'recording', recordingId: 'recording-1' },
  });
  getRecordingMock.mockResolvedValue(null);

  await expect(loadBlobForAsset(PROJECT, 'asset-3')).rejects.toThrow(
    'Recording recording-1 not found.'
  );
});
