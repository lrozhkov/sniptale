import type { AppHelloMessage } from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import type { NativeControllerAcquireReason } from './service-types';
import { applyNativeHelloStatus, clearNativeControllerStatus } from './status-updates';

export function applyNativeHelloAuthority(args: {
  message: AppHelloMessage;
  pendingReason: NativeControllerAcquireReason | null;
  status: NativeAppRuntimeStatus;
}): {
  acquireReason: NativeControllerAcquireReason | null;
  handshakeAccepted: boolean;
  status: NativeAppRuntimeStatus;
} {
  const next = applyNativeHelloStatus(args.status, args.message);
  if (!next.shouldAcquireController) {
    return {
      acquireReason: null,
      handshakeAccepted: false,
      status: clearNativeControllerStatus(next.status),
    };
  }

  return {
    acquireReason: args.pendingReason ?? 'initial-connect',
    handshakeAccepted: true,
    status: next.status,
  };
}
