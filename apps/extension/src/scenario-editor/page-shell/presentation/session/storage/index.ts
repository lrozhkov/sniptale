import { browserStorage } from '../../../../../composition/persistence/infrastructure/browser-storage';
import type { ScenarioPresentationSessionState } from '../types';

const SESSION_STORAGE_KEY_PREFIX = 'scenarioPresentationSession:';
let scenarioPresentationSessionMutationQueues = new Map<string, Promise<void>>();

function createScenarioPresentationSessionStorageKey(sessionId: string): string {
  return `${SESSION_STORAGE_KEY_PREFIX}${sessionId}`;
}

export function runScenarioPresentationSessionMutation<T>(
  sessionId: string,
  run: () => Promise<T>
): Promise<T> {
  const previousMutation =
    scenarioPresentationSessionMutationQueues.get(sessionId) ?? Promise.resolve();
  const nextMutation = previousMutation.catch(() => undefined).then(run);
  const settledMutation = nextMutation.then(
    () => undefined,
    () => undefined
  );
  scenarioPresentationSessionMutationQueues.set(sessionId, settledMutation);
  void settledMutation.then(() => {
    if (scenarioPresentationSessionMutationQueues.get(sessionId) === settledMutation) {
      scenarioPresentationSessionMutationQueues.delete(sessionId);
    }
  });

  return nextMutation;
}

export function resetScenarioPresentationSessionMutationQueuesForTests(): void {
  scenarioPresentationSessionMutationQueues = new Map();
}

export async function loadScenarioPresentationSessionStorageValue(
  sessionId: string
): Promise<unknown> {
  const key = createScenarioPresentationSessionStorageKey(sessionId);
  const items = await browserStorage.session.get(key);
  return items[key];
}

export function writeScenarioPresentationSessionStorageState(
  state: ScenarioPresentationSessionState
): Promise<void> {
  return browserStorage.session.set({
    [createScenarioPresentationSessionStorageKey(state.sessionId)]: state,
  });
}

export function subscribeToScenarioPresentationSessionStorage(
  sessionId: string,
  listener: (value: unknown | undefined) => void
): () => void {
  const key = createScenarioPresentationSessionStorageKey(sessionId);

  return browserStorage.subscribeToChanges((changes, areaName) => {
    if (areaName !== 'session' || !(key in changes)) {
      return;
    }

    listener(changes[key]?.newValue);
  });
}
