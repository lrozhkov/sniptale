import type { ScenarioSessionServiceCore } from './runtime/types/core';
import type { ScenarioSessionServiceState } from './runtime/types/state';

function cloneMapValues<TValue extends object>(source: Map<number, TValue>): Map<number, TValue> {
  return new Map([...source].map(([key, value]) => [key, { ...value }]));
}

function captureScenarioSessionState(
  core: ScenarioSessionServiceCore
): ScenarioSessionServiceState {
  return {
    hydrationPromise: core.hydrationPromise,
    pendingCaptures: new Map(core.pendingCaptures),
    revisions: core.revisions,
    sessions: cloneMapValues(core.sessions),
    surfaces: cloneMapValues(core.surfaces),
  };
}

function restoreMap<TKey, TValue>(target: Map<TKey, TValue>, snapshot: Map<TKey, TValue>): void {
  target.clear();
  for (const [key, value] of snapshot) {
    target.set(key, value);
  }
}

function restoreScenarioSessionState(
  core: ScenarioSessionServiceCore,
  snapshot: ScenarioSessionServiceState
): void {
  core.hydrationPromise = snapshot.hydrationPromise;
  restoreMap(core.pendingCaptures, snapshot.pendingCaptures);
  restoreMap(core.sessions, snapshot.sessions);
  restoreMap(core.surfaces, snapshot.surfaces);
}

export async function runPersistedMutation<TResult>(props: {
  cloneResult: (result: TResult) => TResult;
  core: ScenarioSessionServiceCore;
  mutate: () => TResult;
}): Promise<TResult> {
  return props.core.runPersistedWrite(async () => {
    await props.core.ensureHydrated();
    const previousState = captureScenarioSessionState(props.core);
    const result = props.mutate();
    try {
      await props.core.persistSessions();
    } catch (error) {
      restoreScenarioSessionState(props.core, previousState);
      throw error;
    }
    return props.cloneResult(result);
  });
}
