import { create, type StateCreator } from 'zustand';
import type { VoiceInputPreferences } from '@sniptale/runtime-contracts/voice-input';
import type { NormalizedSettings, SettingsPatch } from '../../../contracts/settings';
import {
  DEFAULT_SETTINGS,
  loadSettingsRuntimeState,
  resetSettingsRuntimeState,
  updateSettingsRuntimeState,
} from './runtime';
import { createUserFacingErrorMessage } from '../../../platform/i18n/user-facing-error';

interface SettingsStore {
  settings: NormalizedSettings;
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: SettingsPatch) => Promise<void>;
  clearSettings: () => Promise<void>;
  reconcileVoiceInputPreferences: (preferences: VoiceInputPreferences) => void;
}

type SettingsWriteState = {
  pendingWriteCount: number;
  writeQueue: Promise<NormalizedSettings>;
  writeVersion: number;
  voiceRevision: number;
};

type SettingsStoreSet = Parameters<StateCreator<SettingsStore>>[0];

function createSettingsWriteState(): SettingsWriteState {
  return {
    pendingWriteCount: 0,
    writeQueue: Promise.resolve(DEFAULT_SETTINGS),
    writeVersion: 0,
    voiceRevision: 0,
  };
}

function syncSettingsWriteQueue(state: SettingsWriteState, settings: NormalizedSettings) {
  state.writeQueue = Promise.resolve(settings);
}

function beginSettingsWrite(state: SettingsWriteState, set: SettingsStoreSet) {
  state.writeVersion += 1;
  state.pendingWriteCount += 1;
  set({ error: null });
}

function finishSettingsWrite(
  state: SettingsWriteState,
  set: SettingsStoreSet,
  patch: Partial<Pick<SettingsStore, 'settings' | 'error' | 'hasLoaded'>> = {}
) {
  state.pendingWriteCount = Math.max(0, state.pendingWriteCount - 1);
  set(patch);
}

function isStaleLoadResult(state: SettingsWriteState, loadVersion: number) {
  return state.writeVersion !== loadVersion || state.pendingWriteCount > 0;
}

/** Storage events win over responses dispatched before the observed voice preference. */
function reconcileSettingsResponse(
  state: SettingsWriteState,
  voiceRevision: number,
  settings: NormalizedSettings,
  get: () => SettingsStore
): NormalizedSettings {
  if (state.voiceRevision === voiceRevision) return settings;
  const reconciled = { ...settings };
  const voiceInput = get().settings.voiceInput;
  if (voiceInput) reconciled.voiceInput = voiceInput;
  else delete reconciled.voiceInput;
  return reconciled;
}

async function loadSettingsIntoStore(
  state: SettingsWriteState,
  set: SettingsStoreSet,
  get: () => SettingsStore
): Promise<void> {
  const loadVersion = state.writeVersion;
  const voiceRevision = state.voiceRevision;
  set({ isLoading: true, error: null });

  try {
    const settings = reconcileSettingsResponse(
      state,
      voiceRevision,
      await loadSettingsRuntimeState(),
      get
    );

    if (isStaleLoadResult(state, loadVersion)) {
      set({ isLoading: false });
      return;
    }

    syncSettingsWriteQueue(state, settings);
    set({ settings, isLoading: false, hasLoaded: true });
  } catch (error) {
    if (isStaleLoadResult(state, loadVersion)) {
      set({ isLoading: false });
      return;
    }

    set({
      error: createUserFacingErrorMessage({
        cause: error,
        detail: 'storage',
        summaryKey: 'common.errors.loadFailed',
      }),
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
    const voiceRevision = state.voiceRevision;
    beginSettingsWrite(state, set);

    const writeOperation = state.writeQueue.then(() => updateSettingsRuntimeState(newSettings));
    state.writeQueue = writeOperation.catch(() => get().settings);

    try {
      const updatedSettings = reconcileSettingsResponse(
        state,
        voiceRevision,
        await writeOperation,
        get
      );
      syncSettingsWriteQueue(state, updatedSettings);
      finishSettingsWrite(state, set, { settings: updatedSettings, error: null, hasLoaded: true });
    } catch (error) {
      const resolvedError = createUserFacingErrorMessage({
        cause: error,
        detail: 'storage',
        summaryKey: 'common.errors.saveFailed',
      });
      finishSettingsWrite(state, set, { error: resolvedError });
      throw new Error(resolvedError, { cause: error });
    }
  };
}

function createClearSettingsAction(
  state: SettingsWriteState,
  set: SettingsStoreSet,
  get: () => SettingsStore
): SettingsStore['clearSettings'] {
  return async () => {
    const voiceRevision = state.voiceRevision;
    beginSettingsWrite(state, set);

    const writeOperation = state.writeQueue.then(() => resetSettingsRuntimeState());
    state.writeQueue = writeOperation.catch(() => get().settings);

    try {
      const settings = reconcileSettingsResponse(state, voiceRevision, await writeOperation, get);
      syncSettingsWriteQueue(state, settings);
      finishSettingsWrite(state, set, { settings, error: null, hasLoaded: true });
    } catch (error) {
      const resolvedError = createUserFacingErrorMessage({
        cause: error,
        detail: 'storage',
        summaryKey: 'common.errors.actionFailed',
      });
      finishSettingsWrite(state, set, { error: resolvedError });
      throw new Error(resolvedError, { cause: error });
    }
  };
}

function createSettingsStoreState(): StateCreator<SettingsStore> {
  const writeState = createSettingsWriteState();

  return (set, get) => ({
    settings: DEFAULT_SETTINGS,
    isLoading: false,
    hasLoaded: false,
    error: null,

    loadSettings: () => loadSettingsIntoStore(writeState, set, get),

    reconcileVoiceInputPreferences: (preferences) => {
      writeState.voiceRevision += 1;
      set({ settings: { ...get().settings, voiceInput: preferences } });
    },

    updateSettings: createUpdateSettingsAction(writeState, set, get),

    clearSettings: createClearSettingsAction(writeState, set, get),
  });
}

export function createSettingsStore() {
  return create<SettingsStore>(createSettingsStoreState());
}

export const useSettingsStore = createSettingsStore();
