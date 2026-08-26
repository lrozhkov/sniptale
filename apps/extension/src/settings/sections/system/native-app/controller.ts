import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { TranslationKey } from '../../../../platform/i18n';
import {
  loadVideoSettings,
  mutateVideoSettings,
} from '../../../../composition/persistence/capture-settings';
import type {
  NativeCaptureSettings,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createNativeAppRuntimeClient } from '../../../runtime/native-app-client';
import { settingsRuntimeMessagingTransport } from '../../../runtime/messaging';
import { browserPermissions } from '@sniptale/platform/browser/permissions';
import type {
  NativeAppRuntimeResponse,
  NativeAppRuntimeStatus,
} from '../../../../contracts/native-app/runtime';
import type { NativeRuntimeOperation } from './types';
import { normalizeNativeAppError } from './connection/error-copy';

type NativeAppSectionState = {
  error: string | null;
  loading: boolean;
  permissionGranted: boolean | null;
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
    permissionGranted: null,
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
  const [settings, permissionGranted] = await Promise.all([
    loadVideoSettings(),
    browserPermissions.contains({ permissions: ['nativeMessaging'] }),
  ]);
  if (!permissionGranted) {
    return {
      error: null,
      loading: false,
      permissionGranted: false,
      settings,
      status: null,
    };
  }
  const runtime = await nativeAppRuntimeClient.query();
  return {
    error: runtime.success
      ? null
      : normalizeNativeAppError(runtime.error ?? null, 'settings.nativeApp.loadError'),
    loading: false,
    permissionGranted: true,
    settings,
    status: runtime.status ?? null,
  };
}

async function requestNativeAppPermission(args: {
  guard: RequestGuard;
  setState: SetNativeAppSectionState;
}): Promise<void> {
  args.setState((current) => ({ ...current, error: null, loading: true }));
  try {
    const granted = await browserPermissions.request({ permissions: ['nativeMessaging'] });
    if (!args.guard.isCurrent()) return;
    if (!granted) {
      args.setState((current) => ({
        ...current,
        error: translatePermissionError(),
        loading: false,
        permissionGranted: false,
      }));
      return;
    }
    const response = await nativeAppRuntimeClient.mutate('reconnect');
    if (!args.guard.isCurrent()) return;
    args.setState((current) =>
      applyRuntimeResponse({ ...current, permissionGranted: true }, response)
    );
  } catch (error) {
    if (!args.guard.isCurrent()) return;
    args.setState((current) => ({
      ...current,
      error: getErrorMessage(error, 'settings.nativeApp.permissionRequestError'),
      loading: false,
      permissionGranted: false,
    }));
  }
}

function translatePermissionError(): string {
  return getErrorMessage(null, 'settings.nativeApp.permissionDenied');
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
    const persistedSettings = await mutateVideoSettings((current) => ({
      ...current,
      native: args.native,
    }));
    const response = await nativeAppRuntimeClient.mutate('sync-settings');
    if (!args.guard.isCurrent()) {
      return;
    }
    args.setState((current) =>
      applyRuntimeResponse({ ...current, settings: persistedSettings }, response)
    );
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

  useEffect(() => {
    const refreshOnNativePermissionChange = (permissions: chrome.permissions.Permissions) => {
      if (permissions.permissions?.includes('nativeMessaging')) {
        void refreshSectionState({ guard: createRequestGuard(), setState });
      }
    };
    const unsubscribeAdded = browserPermissions.subscribeToAdded(refreshOnNativePermissionChange);
    const unsubscribeRemoved = browserPermissions.subscribeToRemoved(
      refreshOnNativePermissionChange
    );
    return () => {
      unsubscribeAdded();
      unsubscribeRemoved();
    };
  }, [createRequestGuard]);

  return {
    error: state.error,
    handleRuntimeAction: (operation: NativeRuntimeOperation) =>
      runRuntimeAction({ guard: createRequestGuard(), operation, setState }),
    loading: state.loading,
    nativeSettings: getNativeSettings(state.settings),
    permissionGranted: state.permissionGranted,
    requestPermission: () => requestNativeAppPermission({ guard: createRequestGuard(), setState }),
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
