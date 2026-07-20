import { beforeEach, expect, it, vi } from 'vitest';

const {
  deletePendingScenarioAssetMock,
  listPendingScenarioAssetsMock,
  readStoredScenarioSessionsMock,
  writeStoredScenarioSessionsMock,
} = vi.hoisted(() => ({
  deletePendingScenarioAssetMock: vi.fn(),
  listPendingScenarioAssetsMock: vi.fn(),
  readStoredScenarioSessionsMock: vi.fn(),
  writeStoredScenarioSessionsMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/projects/assets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/projects/assets')
  >()),
  deletePendingScenarioAsset: deletePendingScenarioAssetMock,
  listPendingScenarioAssets: listPendingScenarioAssetsMock,
}));

vi.mock('../../storage/scenario/session', () => ({
  readStoredScenarioSessions: readStoredScenarioSessionsMock,
  writeStoredScenarioSessions: writeStoredScenarioSessionsMock,
}));

import { hydrateScenarioSessionState } from './state';
import { createStoredPendingScenarioCapture, createStoredScenarioTabState } from './test-support';

function createState() {
  return {
    pendingCaptures: new Map(),
    sessions: new Map(),
    surfaces: new Map(),
  };
}

function createPendingAsset(id: string, tabId: number) {
  const blob = new Blob(['pending'], { type: 'image/png' });
  return {
    id,
    tabId,
    galleryAssetId: null,
    blob,
    mimeType: 'image/png',
    createdAt: 1,
    size: blob.size,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  readStoredScenarioSessionsMock.mockResolvedValue(new Map());
  writeStoredScenarioSessionsMock.mockResolvedValue(undefined);
  listPendingScenarioAssetsMock.mockResolvedValue([]);
  deletePendingScenarioAssetMock.mockResolvedValue(undefined);
});

it('deletes pending capture assets that have no persisted owner after hydrate', async () => {
  listPendingScenarioAssetsMock.mockResolvedValue([createPendingAsset('orphaned-asset', 7)]);

  await hydrateScenarioSessionState(createState());

  expect(deletePendingScenarioAssetMock).toHaveBeenCalledWith('orphaned-asset');
});

it('keeps only pending capture assets whose id and tab match persisted state', async () => {
  const pendingCapture = createStoredPendingScenarioCapture();
  readStoredScenarioSessionsMock.mockResolvedValue(
    new Map([
      [
        12,
        createStoredScenarioTabState({
          captureMode: 'manual',
          pendingCapture,
          projectId: null,
          projectName: null,
        }),
      ],
    ])
  );
  listPendingScenarioAssetsMock.mockResolvedValue([
    createPendingAsset(pendingCapture.pendingAssetId, 12),
    createPendingAsset('wrong-tab-asset', 99),
  ]);

  const state = createState();
  await hydrateScenarioSessionState(state);

  expect(state.pendingCaptures.get(12)).toEqual(pendingCapture);
  expect(deletePendingScenarioAssetMock).toHaveBeenCalledTimes(1);
  expect(deletePendingScenarioAssetMock).toHaveBeenCalledWith('wrong-tab-asset');
});
