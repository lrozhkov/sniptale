import { create, type StateCreator } from 'zustand';
import type { Settings, SettingsPatch } from '../../../contracts/settings';
import {
  DEFAULT_SETTINGS,
  loadSettingsRuntimeState,
  resetSettingsRuntimeState,
  updateSettingsRuntimeState,
} from './settings-runtime-service';

interface SettingsStore {
  settings: Settings;
  isLoading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: SettingsPatch) => Promise<void>;
  clearSettings: () => Promise<void>;
}

type SettingsWriteState = {
  pendingWriteCount: number;
  writeQueue: Promise<Settings>;
  writeVersion: number;
};

type SettingsStoreSet = Parameters<StateCreator<SettingsStore>>[0];

function createSettingsWriteState(): SettingsWriteState {
  return {
    pendingWriteCount: 0,
    writeQueue: Promise.resolve(DEFAULT_SETTINGS),
    writeVersion: 0,
  };
}

function syncSettingsWriteQueue(state: SettingsWriteState, settings: Settings) {
  state.writeQueue = Promise.resolve(settings);
}

function beginSettingsWrite(state: SettingsWriteState, set: SettingsStoreSet) {
  state.writeVersion += 1;
  state.pendingWriteCount += 1;
  set({ isLoading: true, error: null });
}

function finishSettingsWrite(
  state: SettingsWriteState,
  set: SettingsStoreSet,
  patch: Partial<Pick<SettingsStore, 'settings' | 'error'>> = {}
) {
  state.pendingWriteCount = Math.max(0, state.pendingWriteCount - 1);
  set({
    ...patch,
    isLoading: state.pendingWriteCount > 0,
  });
}

function isStaleLoadResult(state: SettingsWriteState, loadVersion: number) {
  return state.writeVersion !== loadVersion || state.pendingWriteCount > 0;
}

async function loadSettingsIntoStore(
  state: SettingsWriteState,
  set: SettingsStoreSet
): Promise<void> {
  const loadVersion = state.writeVersion;
  set({ isLoading: true, error: null });

  try {
    const settings = await loadSettingsRuntimeState();

    if (isStaleLoadResult(state, loadVersion)) {
      return;
    }

    syncSettingsWriteQueue(state, settings);
    set({ settings, isLoading: false });
  } catch (error) {
    if (isStaleLoadResult(state, loadVersion)) {
      return;
    }

    set({
      error: error instanceof Error ? error.message : 'Failed to load settings',
      isLoading: false,
    });
  }
}

function createUpdateSettingsAction(
  state: SettingsWriteState,
  set: SettingsStoreSet,
  get: () => SettingsStore
): SettingsStore['updateSettings'] {
  return async (newSettings) => {
    beginSettingsWrite(state, set);

    const writeOperation = state.writeQueue.then(() => updateSettingsRuntimeState(newSettings));
    state.writeQueue = writeOperation.catch(() => get().settings);

    try {
      const updatedSettings = await writeOperation;
      syncSettingsWriteQueue(state, updatedSettings);
      finishSettingsWrite(state, set, { settings: updatedSettings, error: null });
    } catch (error) {
      const resolvedError = error instanceof Error ? error.message : 'Failed to save settings';
      finishSettingsWrite(state, set, { error: resolvedError });
      throw error instanceof Error ? error : new Error(resolvedError);
    }
  };
}

function createClearSettingsAction(
  state: SettingsWriteState,
  set: SettingsStoreSet,
  get: () => SettingsStore
): SettingsStore['clearSettings'] {
  return async () => {
    beginSettingsWrite(state, set);

    const writeOperation = state.writeQueue.then(() => resetSettingsRuntimeState());
    state.writeQueue = writeOperation.catch(() => get().settings);

    try {
      const settings = await writeOperation;
      syncSettingsWriteQueue(state, settings);
      finishSettingsWrite(state, set, { settings, error: null });
    } catch (error) {
      const resolvedError = error instanceof Error ? error.message : 'Failed to clear settings';
      finishSettingsWrite(state, set, { error: resolvedError });
      throw error instanceof Error ? error : new Error(resolvedError);
    }
  };
}

function createSettingsStoreState(): StateCreator<SettingsStore> {
  const writeState = createSettingsWriteState();

  return (set, get) => ({
    settings: DEFAULT_SETTINGS as Settings,
    isLoading: false,
    error: null,

    loadSettings: () => loadSettingsIntoStore(writeState, set),

    updateSettings: createUpdateSettingsAction(writeState, set, get),

    clearSettings: createClearSettingsAction(writeState, set, get),
  });
}

export function createSettingsStore() {
  return create<SettingsStore>(createSettingsStoreState());
}

export const useSettingsStore = createSettingsStore();
