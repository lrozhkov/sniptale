import {
  estimateNativeMessageJsonUtf8Bytes,
  parseNativeAppInboundMessage,
  type NativeAppInboundMessage,
} from '../../../contracts/native-app';
import type { NativeAppRuntimeStatus } from '../../../contracts/native-app/runtime';
import { applyNativeParseErrorStatus } from './service-status-errors';

export function parseNativeRuntimeMessage(args: {
  rawMessage: unknown;
  status: NativeAppRuntimeStatus;
  warn: (message: string) => void;
}): { message: NativeAppInboundMessage | null; status: NativeAppRuntimeStatus } {
  const parsed = parseNativeAppInboundMessage(
    args.rawMessage,
    estimateNativeMessageJsonUtf8Bytes(args.rawMessage)
  );
  if (parsed.ok) {
    return { message: parsed.value, status: args.status };
  }
  args.warn(`Reject native message: ${parsed.reason}`);
  return { message: null, status: applyNativeParseErrorStatus(args.status, parsed) };
}
