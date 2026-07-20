import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';

export function applyNativeDisconnectError(
  status: NativeAppRuntimeStatus,
  lastError: chrome.runtime.LastError | undefined
): NativeAppRuntimeStatus {
  if (!lastError) {
    return status;
  }

  return {
    ...status,
    error: {
      code: 'unknown',
      recoverable: true,
      ...(lastError.message === undefined ? {} : { message: lastError.message }),
    },
  };
}

export function applyNativeStartupError(
  status: NativeAppRuntimeStatus,
  error: unknown
): NativeAppRuntimeStatus {
  return {
    ...status,
    error: {
      code: 'unknown',
      message: error instanceof Error ? error.message : 'Native app unavailable',
      recoverable: true,
    },
  };
}
