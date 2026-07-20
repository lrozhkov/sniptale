import {
  loadHighlighterSettings,
  saveHighlighterSettings,
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
const settingsSaveQueues = new WeakMap<HighlighterSettingsPersistenceSession, Promise<void>>();

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

export async function saveQueuedHighlighterSettings(
  state: HighlighterSettingsPersistenceState,
  buildUpdated: (settings: HighlighterSettings) => HighlighterSettings | null,
  persistSettings: (settings: HighlighterSettings) => Promise<void> = saveHighlighterSettings,
  readSettings: () => Promise<HighlighterSettings> = loadHighlighterSettings
): Promise<HighlighterSettings | null> {
  const key = getStateKey(state);

  const runSave = async () => {
    if (!reconcileCurrentHighlighterSettings(state)) {
      return null;
    }

    const settings = await readSettings();
    commitHighlighterSettings(state, settings);

    const updated = buildUpdated(settings);
    if (!updated) {
      return null;
    }

    await persistSettings(updated);
    commitHighlighterSettings(state, updated);
    return updated;
  };

  const previousSave = settingsSaveQueues.get(key) ?? Promise.resolve();
  const nextSave = previousSave.catch(() => undefined).then(runSave);

  settingsSaveQueues.set(
    key,
    nextSave.then(
      () => undefined,
      () => undefined
    )
  );

  return nextSave;
}
