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

import {
  getMutableScenarioSession,
  getMutableScenarioSurface,
  hydrateScenarioSessionState,
  persistScenarioSessionState,
} from './state';
import { createDefaultScenarioSessionState, createDefaultScenarioSurfaceState } from './helpers';
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

it('keeps hydrated state usable when pending-asset inventory cannot be read', async () => {
  const stored = createStoredScenarioTabState({
    captureMode: 'manual',
    projectId: null,
    projectName: null,
  });
  readStoredScenarioSessionsMock.mockResolvedValue(new Map([[12, stored]]));
  listPendingScenarioAssetsMock.mockRejectedValue(new Error('inventory failed'));
  const state = createState();

  await expect(hydrateScenarioSessionState(state)).resolves.toBeUndefined();

  expect(state.sessions.has(12)).toBe(true);
  expect(deletePendingScenarioAssetMock).not.toHaveBeenCalled();
});

it('continues orphan cleanup when one pending-asset deletion fails', async () => {
  listPendingScenarioAssetsMock.mockResolvedValue([
    createPendingAsset('failed-asset', 7),
    createPendingAsset('deleted-asset', 8),
  ]);
  deletePendingScenarioAssetMock
    .mockRejectedValueOnce(new Error('delete failed'))
    .mockResolvedValueOnce(undefined);

  await expect(hydrateScenarioSessionState(createState())).resolves.toBeUndefined();

  expect(deletePendingScenarioAssetMock).toHaveBeenCalledTimes(2);
  expect(deletePendingScenarioAssetMock).toHaveBeenCalledWith('deleted-asset');
});

it('serializes persisted state and owns mutable session and surface creation', async () => {
  const state = createState();
  const existingSession = createDefaultScenarioSessionState();
  const existingSurface = createDefaultScenarioSurfaceState();
  state.sessions.set(1, existingSession);
  state.surfaces.set(1, existingSurface);

  expect(getMutableScenarioSession(state.sessions, 1)).toBe(existingSession);
  expect(getMutableScenarioSurface(state.surfaces, 1)).toBe(existingSurface);
  expect(getMutableScenarioSession(state.sessions, 2)).toBe(state.sessions.get(2));
  expect(getMutableScenarioSurface(state.surfaces, 2)).toBe(state.surfaces.get(2));

  await persistScenarioSessionState(state);

  expect(writeStoredScenarioSessionsMock).toHaveBeenCalledOnce();
});
