import { hydrateScenarioSessionState, persistScenarioSessionState } from '../../state';
import {
  getScenarioSessionDisposableState,
  getScenarioSessionDurableState,
  setScenarioSessionHydrationPromise,
} from '../state-buckets';
import type { ScenarioSessionServiceState } from '../types/state';

export function createScenarioSessionServiceLifecycle(state: ScenarioSessionServiceState) {
  const durableState = getScenarioSessionDurableState(state);

  async function ensureHydrated(): Promise<void> {
    const disposableState = getScenarioSessionDisposableState(state);
    if (!disposableState.hydrationPromise) {
      const hydrationPromise = hydrateScenarioSessionState(durableState).catch((error) => {
        setScenarioSessionHydrationPromise(state, null);
        throw error;
      });
      setScenarioSessionHydrationPromise(state, hydrationPromise);
    }

    await getScenarioSessionDisposableState(state).hydrationPromise;
  }

  async function persistSessions(): Promise<void> {
    await persistScenarioSessionState(durableState);
  }

  return {
    ensureHydrated,
    persistSessions,
  };
}
