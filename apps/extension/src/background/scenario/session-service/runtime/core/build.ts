import { createScenarioSessionPendingCaptureBridge } from '../../pending-capture';
import {
  createScenarioSessionPendingCaptureContext,
  createScenarioSessionServiceClearTab,
  createScenarioSessionServiceState,
} from '../state';
import type { ScenarioSessionServiceCore } from '../types/core';
import { createScenarioSessionServiceAccessors } from './accessors';
import { createScenarioSessionServiceLifecycle } from './lifecycle';
import { createScenarioSessionPersistedWriteQueue } from './persisted-write';

export function createScenarioSessionServiceCore(): ScenarioSessionServiceCore {
  const state = createScenarioSessionServiceState();
  const { ensureHydrated, persistSessions } = createScenarioSessionServiceLifecycle(state);
  const runPersistedWrite = createScenarioSessionPersistedWriteQueue();
  const { getMutableSession, getMutableSurface } = createScenarioSessionServiceAccessors(state);
  const pendingCaptureBridge = createScenarioSessionPendingCaptureBridge(
    createScenarioSessionPendingCaptureContext(
      state.pendingCaptures,
      ensureHydrated,
      getMutableSession,
      persistSessions,
      runPersistedWrite
    )
  );

  return {
    ...state,
    ensureHydrated,
    getMutableSession,
    getMutableSurface,
    pendingCaptureBridge,
    persistSessions,
    runPersistedWrite,
    clearTab: createScenarioSessionServiceClearTab({
      ensureHydrated,
      persistSessions,
      runPersistedWrite,
      state,
    }),
  };
}
