import {
  createCurrentValueReader,
  createPreferenceAppliers,
  createPreferenceHydrator,
  createPreferencePersistor,
  createPreferenceSubscription,
  createStorageBackedPreferenceState,
  createStorageChangeHandlers,
  createStoredPreferenceReader,
} from './helpers';
import { createStorageListenerRegistrar } from './storage-listener-registrar';
import type {
  CreateStorageBackedPreferenceServiceArgs,
  StorageBackedPreferenceService,
} from './types';

export type {
  CreateStorageBackedPreferenceServiceArgs,
  StorageBackedPreferenceService,
} from './types';

function createSetPreferenceAction<TStored extends string>(props: {
  applyStoredPreference: (value: TStored | null) => void;
  cleanupStorageListenerIfUnused: () => void;
  ensureStorageListenerRegistered: () => void;
  persistPreference: (value: TStored) => Promise<void>;
}) {
  return async (value: TStored) => {
    props.ensureStorageListenerRegistered();
    try {
      await props.persistPreference(value);
      props.applyStoredPreference(value);
    } finally {
      props.cleanupStorageListenerIfUnused();
    }
  };
}

function createPreferenceReaders<TCurrent, TStored extends string>(props: {
  applyStoredPreference: (value: TStored | null, options?: { notify?: boolean }) => void;
  args: CreateStorageBackedPreferenceServiceArgs<TCurrent, TStored>;
  state: ReturnType<typeof createStorageBackedPreferenceState<TCurrent>>;
}) {
  return {
    getCurrentValue: createCurrentValueReader(props),
    getStoredPreference: createStoredPreferenceReader(props),
  };
}

export function createStorageBackedPreferenceService<TCurrent, TStored extends string>(
  args: CreateStorageBackedPreferenceServiceArgs<TCurrent, TStored>
): StorageBackedPreferenceService<TCurrent, TStored> {
  const state = createStorageBackedPreferenceState(args.initialCurrentValue);
  const { applyCurrentValue, applyStoredPreference } = createPreferenceAppliers(state, args);
  const persistPreference = createPreferencePersistor({ args, state });
  const { handleBrowserStorageChange, handleLocalStorageChange } = createStorageChangeHandlers({
    args,
    applyCurrentValue,
    state,
  });
  const { cleanupStorageListenerIfUnused, ensureStorageListenerRegistered } =
    createStorageListenerRegistrar({
      args,
      handleBrowserStorageChange,
      handleLocalStorageChange,
      state,
    });
  const ensureHydrated = createPreferenceHydrator({
    args,
    applyCurrentValue,
    cleanupStorageListenerIfUnused,
    ensureStorageListenerRegistered,
    state,
  });
  const readers = createPreferenceReaders({
    applyStoredPreference,
    args,
    state,
  });

  return {
    ensureHydrated,
    ...readers,
    setPreference: createSetPreferenceAction({
      applyStoredPreference,
      cleanupStorageListenerIfUnused,
      ensureStorageListenerRegistered,
      persistPreference,
    }),
    subscribe: createPreferenceSubscription({
      cleanupStorageListenerIfUnused,
      ensureHydrated,
      ensureStorageListenerRegistered,
      state,
    }),
  };
}
