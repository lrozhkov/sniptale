import { beforeEach, expect, it, vi } from 'vitest';

const { getProjectAssetMock, getRecordingMock, getScenarioAssetMock } = vi.hoisted(() => ({
  getProjectAssetMock: vi.fn(),
  getRecordingMock: vi.fn(),
  getScenarioAssetMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/projects/index')>()),

  getProjectAsset: getProjectAssetMock,
}));

vi.mock('../../../composition/persistence/recordings/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/recordings/index')>()),

  getRecording: getRecordingMock,
}));

vi.mock('../../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/projects')>()),

  getScenarioAsset: getScenarioAssetMock,
}));

import { loadBlobForAsset, loadBlobForSource } from './blob';

beforeEach(() => {
  vi.clearAllMocks();
});

it('loads blobs for recording, scenario, and project asset sources', async () => {
  const recordingBlob = new Blob(['recording']);
  const scenarioBlob = new Blob(['scenario']);
  const projectBlob = new Blob(['asset']);

  getRecordingMock.mockResolvedValue({ blob: recordingBlob });
  getScenarioAssetMock.mockResolvedValue({ blob: scenarioBlob });
  getProjectAssetMock.mockResolvedValue({ blob: projectBlob });

  await expect(loadBlobForSource({ kind: 'recording', recordingId: 'rec-1' })).resolves.toBe(
    recordingBlob
  );
  await expect(
    loadBlobForSource({ kind: 'scenario-asset', scenarioAssetId: 'scenario-1' })
  ).resolves.toBe(scenarioBlob);
  await expect(
    loadBlobForAsset({ source: { kind: 'project-asset', projectAssetId: 'asset-1' } } as never)
  ).resolves.toBe(projectBlob);
});

it('throws clear errors when a referenced blob source is missing', async () => {
  getRecordingMock.mockResolvedValue(undefined);
  getScenarioAssetMock.mockResolvedValue(undefined);
  getProjectAssetMock.mockResolvedValue(undefined);

  await expect(loadBlobForSource({ kind: 'recording', recordingId: 'missing' })).rejects.toThrow(
    'Recording missing not found.'
  );
  await expect(
    loadBlobForSource({ kind: 'scenario-asset', scenarioAssetId: 'missing' })
  ).rejects.toThrow('Scenario asset missing not found.');
  await expect(
    loadBlobForSource({ kind: 'project-asset', projectAssetId: 'missing' })
  ).rejects.toThrow('Project asset missing not found.');
});
