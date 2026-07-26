import {
  loadHighlighterSettings,
  type HighlighterMutationOutcome,
} from '../../../../composition/persistence/highlighter';
import type { HighlighterSettings } from '../../../../features/highlighter/contracts';

export type HighlighterSettingsPersistenceSession = object;

export type HighlighterSettingsPersistenceState = {
  settingsPersistenceSession: HighlighterSettingsPersistenceSession;
  settings: HighlighterSettings | null;
  setSettings: (value: HighlighterSettings | null) => void;
};

const settingsSnapshots = new WeakMap<
  HighlighterSettingsPersistenceSession,
  HighlighterSettings | null
>();
const settingsMutationQueues = new WeakMap<HighlighterSettingsPersistenceSession, Promise<void>>();

export function createHighlighterSettingsPersistenceSession(): HighlighterSettingsPersistenceSession {
  return {};
}

function getStateKey(
  state: HighlighterSettingsPersistenceState
): HighlighterSettingsPersistenceSession {
  return state.settingsPersistenceSession;
}

export function syncHighlighterSettingsSnapshot(
  settingsPersistenceSession: HighlighterSettingsPersistenceSession,
  settings: HighlighterSettings | null
) {
  settingsSnapshots.set(settingsPersistenceSession, settings);
}

export function reconcileCurrentHighlighterSettings(
  state: HighlighterSettingsPersistenceState
): HighlighterSettings | null {
  const key = getStateKey(state);
  const snapshot = settingsSnapshots.get(key);

  if (snapshot === undefined || (snapshot === null && state.settings !== null)) {
    settingsSnapshots.set(key, state.settings);
    return state.settings;
  }

  return snapshot;
}

function commitHighlighterSettings(
  state: HighlighterSettingsPersistenceState,
  settings: HighlighterSettings
) {
  syncHighlighterSettingsSnapshot(state.settingsPersistenceSession, settings);
  state.setSettings(settings);
}

export async function runQueuedHighlighterMutation(
  state: HighlighterSettingsPersistenceState,
  mutate: () => Promise<HighlighterMutationOutcome | boolean | void>,
  readSettings: () => Promise<HighlighterSettings> = loadHighlighterSettings
): Promise<{
  applied: boolean;
  outcome: HighlighterMutationOutcome;
  settings: HighlighterSettings;
} | null> {
  const key = getStateKey(state);

  const runMutation = async () => {
    if (!reconcileCurrentHighlighterSettings(state)) {
      return null;
    }

    const mutationResult = await mutate();
    const outcome: HighlighterMutationOutcome =
      mutationResult === undefined || mutationResult === true
        ? 'applied'
        : mutationResult === false
          ? 'rejected'
          : mutationResult;
    const settings = await readSettings();
    commitHighlighterSettings(state, settings);
    return { applied: outcome === 'applied', outcome, settings };
  };

  const previousMutation = settingsMutationQueues.get(key) ?? Promise.resolve();
  const nextMutation = previousMutation.catch(() => undefined).then(runMutation);

  settingsMutationQueues.set(
    key,
    nextMutation.then(
      () => undefined,
      () => undefined
    )
  );

  return nextMutation;
}
