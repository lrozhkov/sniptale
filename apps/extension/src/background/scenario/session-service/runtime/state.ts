import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { PendingScenarioCapture } from '../types';
import { clearScenarioProjectRevision } from '../revision';
import type { ScenarioSessionPendingCaptureContext } from '../pending-capture';
import { clearPendingScenarioCaptureAsset } from '../pending-assets';
import {
  clearScenarioSessionDurableTabState,
  createScenarioSessionDisposableState,
  createScenarioSessionDurableState,
  createScenarioSessionReconstructibleState,
  getScenarioSessionDurableState,
  getScenarioSessionReconstructibleState,
} from './state-buckets';
import type { ScenarioSessionServiceState } from './types/state';

const logger = createLogger({ namespace: 'BackgroundScenarioSession' });

export function createScenarioSessionServiceState(): ScenarioSessionServiceState {
  return {
    ...createScenarioSessionDisposableState(),
    ...createScenarioSessionDurableState(),
    ...createScenarioSessionReconstructibleState(),
  };
}

export function createScenarioSessionPendingCaptureContext(
  pendingCaptures: Map<number, PendingScenarioCapture>,
  ensureHydrated: () => Promise<void>,
  getMutableSession: (tabId: number) => ScenarioSessionState,
  persistSessions: () => Promise<void>,
  runPersistedWrite: <TResult>(task: () => Promise<TResult>) => Promise<TResult>
): ScenarioSessionPendingCaptureContext {
  return {
    ensureHydrated,
    getMutableSession,
    pendingCaptures,
    persistSessions,
    runPersistedWrite,
  };
}

export function createScenarioSessionServiceClearTab(args: {
  ensureHydrated: () => Promise<void>;
  persistSessions: () => Promise<void>;
  runPersistedWrite: <TResult>(task: () => Promise<TResult>) => Promise<TResult>;
  state: ScenarioSessionServiceState;
}) {
  return async (tabId: number): Promise<void> => {
    await args.ensureHydrated();

    const previousPendingCapture = await args.runPersistedWrite(async () => {
      const durableState = getScenarioSessionDurableState(args.state);
      const reconstructibleState = getScenarioSessionReconstructibleState(args.state);
      const pendingCapture = durableState.pendingCaptures.get(tabId) ?? null;
      const previousSession = durableState.sessions.get(tabId);
      const previousSurface = durableState.surfaces.get(tabId);

      clearScenarioSessionDurableTabState(durableState, tabId);
      clearScenarioProjectRevision(reconstructibleState.revisions, tabId);

      try {
        await args.persistSessions();
      } catch (error) {
        if (pendingCapture) {
          durableState.pendingCaptures.set(tabId, pendingCapture);
        }
        if (previousSession) {
          durableState.sessions.set(tabId, previousSession);
        }
        if (previousSurface) {
          durableState.surfaces.set(tabId, previousSurface);
        }
        throw error;
      }

      return pendingCapture;
    });

    try {
      await clearPendingScenarioCaptureAsset(previousPendingCapture);
    } catch (error) {
      logger.warn('Failed to clear pending capture during tab cleanup', {
        error,
        pendingAssetId: previousPendingCapture?.pendingAssetId ?? null,
        tabId,
      });
    }
  };
}
