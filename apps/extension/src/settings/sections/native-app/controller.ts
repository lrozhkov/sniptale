import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { TranslationKey } from '../../../platform/i18n';
import {
  loadVideoSettings,
  saveVideoSettings,
} from '../../../composition/persistence/capture-settings';
import type {
  NativeCaptureSettings,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createNativeAppRuntimeClient } from '../../runtime/native-app-client';
import { settingsRuntimeMessagingTransport } from '../../runtime/messaging';
import type {
  NativeAppRuntimeResponse,
  NativeAppRuntimeStatus,
} from '../../../contracts/native-app/runtime';
import type { NativeRuntimeOperation } from './types';
import { normalizeNativeAppError } from './error-copy';

type NativeAppSectionState = {
  error: string | null;
  loading: boolean;
  settings: VideoRecordingSettings;
  status: NativeAppRuntimeStatus | null;
};
type SetNativeAppSectionState = Dispatch<SetStateAction<NativeAppSectionState>>;
type RequestGuard = {
  isCurrent(): boolean;
};

const defaultSettings = DEFAULT_VIDEO_SETTINGS;
const nativeStatusRefreshAttempts = 3;
const nativeStatusRefreshDelayMs = 250;
const nativeAppRuntimeClient = createNativeAppRuntimeClient(settingsRuntimeMessagingTransport);

function getNativeSettings(settings: VideoRecordingSettings): NativeCaptureSettings {
  return settings.native ?? (defaultSettings.native as NativeCaptureSettings);
}

function createInitialState(): NativeAppSectionState {
  return {
    error: null,
    loading: true,
    settings: defaultSettings,
    status: null,
  };
}

function getErrorMessage(error: unknown, fallbackKey: TranslationKey): string {
  return normalizeNativeAppError(error instanceof Error ? error.message : null, fallbackKey);
}

function applyRuntimeResponse(
  state: NativeAppSectionState,
  response: NativeAppRuntimeResponse
): NativeAppSectionState {
  return {
    ...state,
    error: response.success
      ? null
      : normalizeNativeAppError(response.error ?? null, 'settings.nativeApp.actionError'),
    loading: false,
    settings: response.settings ? { ...state.settings, native: response.settings } : state.settings,
    status: response.status ?? state.status,
  };
}

async function loadSectionState(): Promise<NativeAppSectionState> {
  const [settings, runtime] = await Promise.all([
    loadVideoSettings(),
    nativeAppRuntimeClient.query(),
  ]);
  return {
    error: runtime.success
      ? null
      : normalizeNativeAppError(runtime.error ?? null, 'settings.nativeApp.loadError'),
    loading: false,
    settings,
    status: runtime.status ?? null,
  };
}

async function refreshSectionState(args: {
  guard: RequestGuard;
  setState: SetNativeAppSectionState;
}): Promise<void> {
  args.setState((current) => ({ ...current, error: null, loading: true }));
  try {
    const next = await loadSectionState();
    if (!args.guard.isCurrent()) {
      return;
    }
    args.setState(next);
  } catch (error) {
    if (!args.guard.isCurrent()) {
      return;
    }
    args.setState((current) => ({
      ...current,
      error: getErrorMessage(error, 'settings.nativeApp.loadError'),
      loading: false,
    }));
  }
}

async function updateNativeSettings(args: {
  guard: RequestGuard;
  native: NativeCaptureSettings;
  setState: SetNativeAppSectionState;
  settings: VideoRecordingSettings;
}): Promise<void> {
  const nextSettings = { ...args.settings, native: args.native };
  args.setState((current) => ({ ...current, error: null, settings: nextSettings }));
  try {
    await saveVideoSettings(nextSettings);
    const response = await nativeAppRuntimeClient.mutate('sync-settings');
    if (!args.guard.isCurrent()) {
      return;
    }
    args.setState((current) => applyRuntimeResponse(current, response));
  } catch (error) {
    if (!args.guard.isCurrent()) {
      return;
    }
    args.setState((current) => ({
      ...current,
      error: getErrorMessage(error, 'settings.nativeApp.actionError'),
      settings: args.settings,
    }));
  }
}

function waitForNativeStatusRefresh(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, nativeStatusRefreshDelayMs);
  });
}

async function refreshTransientReconnectStatus(
  response: NativeAppRuntimeResponse
): Promise<NativeAppRuntimeResponse> {
  let current = response;
  for (
    let attempt = 0;
    current.status?.connectionState === 'connecting' && attempt < nativeStatusRefreshAttempts;
    attempt += 1
  ) {
    await waitForNativeStatusRefresh();
    current = await nativeAppRuntimeClient.query();
  }
  return current;
}

async function runRuntimeAction(args: {
  guard: RequestGuard;
  operation: NativeRuntimeOperation;
  setState: SetNativeAppSectionState;
}): Promise<void> {
  args.setState((current) => ({ ...current, error: null }));
  try {
    const response = await nativeAppRuntimeClient.mutate(args.operation);
    const resolved =
      args.operation === 'reconnect' ? await refreshTransientReconnectStatus(response) : response;
    if (!args.guard.isCurrent()) {
      return;
    }
    args.setState((current) => applyRuntimeResponse(current, resolved));
  } catch (error) {
    if (!args.guard.isCurrent()) {
      return;
    }
    args.setState((current) => ({
      ...current,
      error: getErrorMessage(error, 'settings.nativeApp.actionError'),
    }));
  }
}

export function useNativeAppSectionController() {
  const [state, setState] = useState<NativeAppSectionState>(createInitialState);
  const requestGenerationRef = useRef(0);

  const createRequestGuard = useCallback((): RequestGuard => {
    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    return {
      isCurrent: () => requestGenerationRef.current === generation,
    };
  }, []);

  useEffect(() => {
    void refreshSectionState({ guard: createRequestGuard(), setState });
  }, [createRequestGuard]);

  return {
    error: state.error,
    handleRuntimeAction: (operation: NativeRuntimeOperation) =>
      runRuntimeAction({ guard: createRequestGuard(), operation, setState }),
    loading: state.loading,
    nativeSettings: getNativeSettings(state.settings),
    status: state.status,
    updateNativeSettings: (native: NativeCaptureSettings) =>
      updateNativeSettings({
        guard: createRequestGuard(),
        native,
        setState,
        settings: state.settings,
      }),
  };
}
