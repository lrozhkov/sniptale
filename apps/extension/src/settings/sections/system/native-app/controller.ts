import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { TranslationKey } from '../../../../platform/i18n';
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
  status: NativeAppRuntimeStatus | null;
};
type SetNativeAppSectionState = Dispatch<SetStateAction<NativeAppSectionState>>;
type RequestGuard = {
  isCurrent(): boolean;
};

const nativeStatusRefreshAttempts = 3;
const nativeStatusRefreshDelayMs = 250;
const nativeAppRuntimeClient = createNativeAppRuntimeClient(settingsRuntimeMessagingTransport);

function createInitialState(): NativeAppSectionState {
  return {
    error: null,
    loading: true,
    permissionGranted: null,
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
    status: response.status ?? state.status,
  };
}

async function loadSectionState(): Promise<NativeAppSectionState> {
  const permissionGranted = await browserPermissions.contains({ permissions: ['nativeMessaging'] });
  if (!permissionGranted) {
    return {
      error: null,
      loading: false,
      permissionGranted: false,
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
  clientId?: string;
  setState: SetNativeAppSectionState;
}): Promise<void> {
  args.setState((current) => ({ ...current, error: null }));
  try {
    const response = await nativeAppRuntimeClient.mutate(args.operation, args.clientId);
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

  useEffect(() => {
    let disposed = false;
    let polling = false;
    const timer = setInterval(async () => {
      if (polling || state.permissionGranted !== true) return;
      polling = true;
      const generation = requestGenerationRef.current;
      try {
        const response = await nativeAppRuntimeClient.query();
        if (!disposed && generation === requestGenerationRef.current) {
          setState((current) =>
            response.success
              ? { ...current, status: response.status ?? current.status }
              : applyRuntimeResponse(current, response)
          );
        }
      } catch {
        // The next status request can recover from a transient runtime disconnect.
      } finally {
        polling = false;
      }
    }, 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [state.permissionGranted]);

  return {
    error: state.error,
    handleRuntimeAction: (operation: NativeRuntimeOperation, clientId?: string) =>
      runRuntimeAction({
        guard: createRequestGuard(),
        operation,
        setState,
        ...(clientId ? { clientId } : {}),
      }),
    loading: state.loading,
    permissionGranted: state.permissionGranted,
    requestPermission: () => requestNativeAppPermission({ guard: createRequestGuard(), setState }),
    status: state.status,
  };
}
