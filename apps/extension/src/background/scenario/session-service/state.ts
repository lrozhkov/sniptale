import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { PendingScenarioAssetEntry } from '../../../composition/persistence/scenario/contracts';
import {
  deletePendingScenarioAsset,
  listPendingScenarioAssets,
} from '../../../composition/persistence/scenario/projects/assets';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  readStoredScenarioSessions,
  writeStoredScenarioSessions,
} from '../../storage/scenario/session';
import {
  createDefaultScenarioSessionState,
  createDefaultScenarioSurfaceState,
  hydrateScenarioSessionMaps,
  serializeScenarioSessionMaps,
} from './helpers';
import type { PendingScenarioCapture } from './types';

const logger = createLogger({ namespace: 'BackgroundScenarioSession' });

type ScenarioSessionMaps = {
  pendingCaptures: Map<number, PendingScenarioCapture>;
  sessions: Map<number, ScenarioSessionState>;
  surfaces: Map<number, ScenarioRecorderSurfaceState>;
};

function collectExpectedPendingAssetTabs(
  pendingCaptures: Map<number, PendingScenarioCapture>
): Map<string, number> {
  const expectedTabsByAssetId = new Map<string, number>();
  pendingCaptures.forEach((capture, tabId) => {
    expectedTabsByAssetId.set(capture.pendingAssetId, tabId);
  });
  return expectedTabsByAssetId;
}

function isOwnedPendingScenarioAsset(
  entry: PendingScenarioAssetEntry,
  expectedTabsByAssetId: Map<string, number>
): boolean {
  return expectedTabsByAssetId.get(entry.id) === entry.tabId;
}

async function reconcilePendingScenarioAssetStore(
  pendingCaptures: Map<number, PendingScenarioCapture>
): Promise<void> {
  const expectedTabsByAssetId = collectExpectedPendingAssetTabs(pendingCaptures);
  let pendingAssets: PendingScenarioAssetEntry[] = [];
  try {
    pendingAssets = await listPendingScenarioAssets();
  } catch (error) {
    logger.warn('Failed to list pending scenario capture assets for recovery cleanup', { error });
    return;
  }

  await Promise.all(
    pendingAssets
      .filter((entry) => !isOwnedPendingScenarioAsset(entry, expectedTabsByAssetId))
      .map(async (entry) => {
        try {
          await deletePendingScenarioAsset(entry.id);
        } catch (error) {
          logger.warn('Failed to clear orphaned pending scenario capture asset', {
            error,
            pendingAssetId: entry.id,
            tabId: entry.tabId,
          });
        }
      })
  );
}

export async function hydrateScenarioSessionState(state: ScenarioSessionMaps): Promise<void> {
  const storedSessions = await readStoredScenarioSessions();
  hydrateScenarioSessionMaps({
    pendingCaptures: state.pendingCaptures,
    sessions: state.sessions,
    storedSessions,
    surfaces: state.surfaces,
  });
  await reconcilePendingScenarioAssetStore(state.pendingCaptures);
}

export async function persistScenarioSessionState(state: ScenarioSessionMaps): Promise<void> {
  await writeStoredScenarioSessions(
    serializeScenarioSessionMaps({
      getMutableSurface: (tabId) => getMutableScenarioSurface(state.surfaces, tabId),
      pendingCaptures: state.pendingCaptures,
      sessions: state.sessions,
    })
  );
}

export function getMutableScenarioSession(
  sessions: Map<number, ScenarioSessionState>,
  tabId: number
): ScenarioSessionState {
  const existing = sessions.get(tabId);
  if (existing) {
    return existing;
  }

  const created = createDefaultScenarioSessionState();
  sessions.set(tabId, created);
  return created;
}

export function getMutableScenarioSurface(
  surfaces: Map<number, ScenarioRecorderSurfaceState>,
  tabId: number
): ScenarioRecorderSurfaceState {
  const existing = surfaces.get(tabId);
  if (existing) {
    return existing;
  }

  const created = createDefaultScenarioSurfaceState();
  surfaces.set(tabId, created);
  return created;
}
