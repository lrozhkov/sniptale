import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { PendingScenarioCapture } from '../types';
import type { ScenarioSessionServiceState } from './types/state';

type ScenarioSessionDurableState = Pick<
  ScenarioSessionServiceState,
  'pendingCaptures' | 'sessions' | 'surfaces'
>;

type ScenarioSessionReconstructibleState = Pick<ScenarioSessionServiceState, 'revisions'>;

type ScenarioSessionDisposableState = Pick<ScenarioSessionServiceState, 'hydrationPromise'>;

export function createScenarioSessionDurableState(): ScenarioSessionDurableState {
  return {
    pendingCaptures: new Map<number, PendingScenarioCapture>(),
    sessions: new Map<number, ScenarioSessionState>(),
    surfaces: new Map<number, ScenarioRecorderSurfaceState>(),
  };
}

export function createScenarioSessionReconstructibleState(): ScenarioSessionReconstructibleState {
  return {
    revisions: new Map<number, number>(),
  };
}

export function createScenarioSessionDisposableState(): ScenarioSessionDisposableState {
  return {
    hydrationPromise: null,
  };
}

export function getScenarioSessionDurableState(
  state: ScenarioSessionServiceState
): ScenarioSessionDurableState {
  return {
    pendingCaptures: state.pendingCaptures,
    sessions: state.sessions,
    surfaces: state.surfaces,
  };
}

export function getScenarioSessionReconstructibleState(
  state: ScenarioSessionServiceState
): ScenarioSessionReconstructibleState {
  return {
    revisions: state.revisions,
  };
}

export function getScenarioSessionDisposableState(
  state: ScenarioSessionServiceState
): ScenarioSessionDisposableState {
  return {
    hydrationPromise: state.hydrationPromise,
  };
}

export function setScenarioSessionHydrationPromise(
  state: ScenarioSessionServiceState,
  hydrationPromise: Promise<void> | null
): void {
  state.hydrationPromise = hydrationPromise;
}

export function clearScenarioSessionDurableTabState(
  state: ScenarioSessionDurableState,
  tabId: number
): void {
  state.pendingCaptures.delete(tabId);
  state.sessions.delete(tabId);
  state.surfaces.delete(tabId);
}
