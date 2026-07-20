import { expect, it } from 'vitest';

import {
  clearScenarioSessionDurableTabState,
  createScenarioSessionDisposableState,
  createScenarioSessionDurableState,
  createScenarioSessionReconstructibleState,
  getScenarioSessionDurableState,
  getScenarioSessionDisposableState,
  getScenarioSessionReconstructibleState,
  setScenarioSessionHydrationPromise,
} from './state-buckets';
import { createScenarioSessionServiceState } from './state';

it('classifies runtime state into durable, reconstructible, and disposable buckets', () => {
  const state = createScenarioSessionServiceState();

  expect(getScenarioSessionDurableState(state)).toEqual({
    pendingCaptures: state.pendingCaptures,
    sessions: state.sessions,
    surfaces: state.surfaces,
  });
  expect(getScenarioSessionReconstructibleState(state)).toEqual({
    revisions: state.revisions,
  });
  expect(getScenarioSessionDisposableState(state)).toEqual({
    hydrationPromise: state.hydrationPromise,
  });
});

it('creates isolated owner-local bucket defaults and clears only durable tab state', () => {
  const durableState = createScenarioSessionDurableState();
  const reconstructibleState = createScenarioSessionReconstructibleState();
  const disposableState = createScenarioSessionDisposableState();

  durableState.pendingCaptures.set(7, { id: 'capture-7' } as never);
  durableState.sessions.set(7, { enabled: true } as never);
  durableState.surfaces.set(7, { screenshotMode: true } as never);
  reconstructibleState.revisions.set(7, 4);
  setScenarioSessionHydrationPromise(
    { ...durableState, ...reconstructibleState, ...disposableState },
    Promise.resolve()
  );

  clearScenarioSessionDurableTabState(durableState, 7);

  expect(durableState.pendingCaptures.has(7)).toBe(false);
  expect(durableState.sessions.has(7)).toBe(false);
  expect(durableState.surfaces.has(7)).toBe(false);
  expect(reconstructibleState.revisions.get(7)).toBe(4);
  expect(disposableState.hydrationPromise).toBeNull();
});
