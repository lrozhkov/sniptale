import { persistBrowserStoredPreference, readBrowserStoredPreference } from './browser-io';
import type {
  ApplyPreferenceOptions,
  CreateStorageBackedPreferenceServiceArgs as PreferenceArgs,
  PreferenceChangeListener,
  StorageBackedPreferenceBackend,
  StorageBackedPreferenceState as PreferenceState,
} from './types';

type PreferenceHydratorProps<TCurrent, TStored extends string> = {
  args: PreferenceArgs<TCurrent, TStored>;
  applyCurrentValue: (value: TCurrent, options?: ApplyPreferenceOptions) => void;
  cleanupStorageListenerIfUnused: () => void;
  ensureStorageListenerRegistered: () => void;
  state: PreferenceState<TCurrent>;
};

export function createStorageBackedPreferenceState<TCurrent>(
  initialCurrentValue: TCurrent
): PreferenceState<TCurrent> {
  return {
    backend: null,
    currentValue: initialCurrentValue,
    hydrated: false,
    hydrationPromise: null,
    listeners: new Set(),
    storageListenerCleanup: null,
  };
}

export function resolveStorageBackedPreferenceBackend<TCurrent, TStored extends string>(
  args: PreferenceArgs<TCurrent, TStored>,
  state: PreferenceState<TCurrent>
): StorageBackedPreferenceBackend {
  if (state.backend) {
    return state.backend;
  }

  state.backend = args.isBrowserStorageAvailable() ? 'browser' : 'local';
  return state.backend;
}

function currentValueEquals<TCurrent>(left: TCurrent, right: TCurrent): boolean {
  return Object.is(left, right);
}

function persistStoredPreference<TCurrent, TStored extends string>(
  args: PreferenceArgs<TCurrent, TStored>,
  state: PreferenceState<TCurrent>,
  value: TCurrent
): Promise<void> {
  const storedPreference = args.mapCurrentToStoredPreference(value);
  if (storedPreference === null) {
    return Promise.resolve();
  }

  if (resolveStorageBackedPreferenceBackend(args, state) === 'browser') {
    return persistBrowserStoredPreference(args.storageKey, storedPreference);
  }

  return Promise.resolve(args.writeLocalStoragePreference(storedPreference));
}

export function createPreferenceAppliers<TCurrent, TStored extends string>(
  state: PreferenceState<TCurrent>,
  args: PreferenceArgs<TCurrent, TStored>
) {
  const notifyListeners = (value: TCurrent) => {
    for (const listener of state.listeners) {
      listener(value);
    }

    args.dispatchChange?.(value);
  };

  const applyCurrentValue = (value: TCurrent, { notify = true }: ApplyPreferenceOptions = {}) => {
    state.currentValue = value;

    if (notify) {
      notifyListeners(value);
    }
  };

  return {
    applyCurrentValue,
    applyStoredPreference: (value: TStored | null, options?: ApplyPreferenceOptions) => {
      applyCurrentValue(args.mapStoredPreferenceToCurrent(value, state.currentValue), options);
    },
  };
}

export function createPreferencePersistor<TCurrent, TStored extends string>(props: {
  args: PreferenceArgs<TCurrent, TStored>;
  state: PreferenceState<TCurrent>;
}) {
  return (value: TStored) => {
    const nextCurrentValue = props.args.mapStoredPreferenceToCurrent(
      value,
      props.state.currentValue
    );
    return persistStoredPreference(props.args, props.state, nextCurrentValue);
  };
}

export function createStorageChangeHandlers<TCurrent, TStored extends string>(props: {
  args: PreferenceArgs<TCurrent, TStored>;
  applyCurrentValue: (value: TCurrent, options?: ApplyPreferenceOptions) => void;
  state: PreferenceState<TCurrent>;
}) {
  const applyNextStoredPreference = (value: TStored | null) => {
    const nextCurrentValue = props.args.mapStoredPreferenceToCurrent(
      value,
      props.state.currentValue
    );
    if (currentValueEquals(nextCurrentValue, props.state.currentValue)) {
      return;
    }

    props.applyCurrentValue(nextCurrentValue);
  };

  return {
    handleBrowserStorageChange: (
      changes: Record<string, { newValue?: unknown }>,
      areaName: chrome.storage.AreaName
    ) => {
      const storageChange = changes[props.args.storageKey];
      if (areaName !== props.args.storageArea || !storageChange) {
        return;
      }

      applyNextStoredPreference(props.args.normalizeStoredPreference(storageChange.newValue));
    },
    handleLocalStorageChange: (event: StorageEvent) => {
      if (event.key !== null && event.key !== props.args.storageKey) {
        return;
      }

      applyNextStoredPreference(props.args.readLocalStoragePreference());
    },
  };
}

function applyHydratedStoredPreference<TCurrent, TStored extends string>(
  props: PreferenceHydratorProps<TCurrent, TStored>,
  value: TStored | null
) {
  const nextCurrentValue = props.args.mapStoredPreferenceToCurrent(value, props.state.currentValue);
  props.state.hydrated = true;

  if (!currentValueEquals(nextCurrentValue, props.state.currentValue)) {
    props.applyCurrentValue(nextCurrentValue);
  }
}

function hydrateFromBrowserStorage<TCurrent, TStored extends string>(
  props: PreferenceHydratorProps<TCurrent, TStored>
) {
  props.state.hydrationPromise = readBrowserStoredPreference(props.args.storageKey)
    .then((result) => {
      applyHydratedStoredPreference(
        props,
        props.args.normalizeStoredPreference(result[props.args.storageKey])
      );
      props.state.hydrationPromise = null;
      props.cleanupStorageListenerIfUnused();
    })
    .catch((error) => {
      props.state.hydrationPromise = null;
      props.cleanupStorageListenerIfUnused();
      throw error;
    });

  return props.state.hydrationPromise;
}

export function createPreferenceHydrator<TCurrent, TStored extends string>(
  props: PreferenceHydratorProps<TCurrent, TStored>
) {
  return (): Promise<void> => {
    if (props.state.hydrated) {
      return Promise.resolve();
    }

    if (props.state.hydrationPromise) {
      return props.state.hydrationPromise;
    }

    props.ensureStorageListenerRegistered();

    if (resolveStorageBackedPreferenceBackend(props.args, props.state) === 'local') {
      applyHydratedStoredPreference(props, props.args.readLocalStoragePreference());
      props.cleanupStorageListenerIfUnused();
      return Promise.resolve();
    }

    return hydrateFromBrowserStorage(props);
  };
}

export function createPreferenceSubscription<TCurrent>(props: {
  cleanupStorageListenerIfUnused: () => void;
  ensureHydrated: () => Promise<void>;
  ensureStorageListenerRegistered: () => void;
  state: PreferenceState<TCurrent>;
}) {
  return (listener: PreferenceChangeListener<TCurrent>) => {
    props.state.listeners.add(listener);
    props.ensureStorageListenerRegistered();

    const initialValue = props.state.currentValue;
    void props
      .ensureHydrated()
      .then(() => {
        if (
          !props.state.listeners.has(listener) ||
          !currentValueEquals(props.state.currentValue, initialValue)
        ) {
          return;
        }

        listener(props.state.currentValue);
      })
      .catch(() => undefined);

    return () => {
      props.state.listeners.delete(listener);
      props.cleanupStorageListenerIfUnused();
    };
  };
}

export function createStoredPreferenceReader<TCurrent, TStored extends string>(props: {
  args: PreferenceArgs<TCurrent, TStored>;
  state: PreferenceState<TCurrent>;
}) {
  return () => {
    if (
      !props.state.hydrated &&
      resolveStorageBackedPreferenceBackend(props.args, props.state) === 'local'
    ) {
      return props.args.readLocalStoragePreference();
    }

    return props.state.hydrated
      ? props.args.mapCurrentToStoredPreference(props.state.currentValue)
      : null;
  };
}

export function createCurrentValueReader<TCurrent, TStored extends string>(props: {
  applyStoredPreference: (value: TStored | null, options?: ApplyPreferenceOptions) => void;
  args: PreferenceArgs<TCurrent, TStored>;
  state: PreferenceState<TCurrent>;
}) {
  return () => {
    if (
      !props.state.hydrated &&
      resolveStorageBackedPreferenceBackend(props.args, props.state) === 'local'
    ) {
      props.applyStoredPreference(props.args.readLocalStoragePreference(), { notify: false });
    }

    return props.state.currentValue;
  };
}
