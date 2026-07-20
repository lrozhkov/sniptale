import type { NativeAppParseRejectReason } from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';

export function applyNativeAcquireIdentityError(
  status: NativeAppRuntimeStatus
): NativeAppRuntimeStatus {
  return {
    ...status,
    connectionState: 'error',
    error: {
      code: 'storage-failed',
      message: 'Unable to resolve native controller profile identity',
      recoverable: true,
    },
  };
}

export function applyNativeParseErrorStatus(
  status: NativeAppRuntimeStatus,
  error: { error: string; reason: NativeAppParseRejectReason }
): NativeAppRuntimeStatus {
  return {
    ...status,
    connectionState: 'error',
    error: {
      code: error.reason,
      message: error.error,
      recoverable: error.reason !== 'native-message-too-large',
    },
  };
}
