import {
  NATIVE_HOST_TO_EXTENSION_MAX_MESSAGE_BYTES,
  NATIVE_MESSAGE_TARGET_MAX_JSON_UTF8_BYTES,
} from '@sniptale/runtime-contracts/native-app/constants';
import { isNativeTrayActionKind } from './parser-control';
import {
  fail,
  isAsciiId,
  isRecord,
  isSafeFilename,
  isString,
  type NativeAppParseRejectReason,
  type ParseResult,
} from './parser-shared';
import { validateMessageByType } from './parser-router';
import type { NativeAppInboundMessage } from './types';

export type { NativeAppParseRejectReason, ParseResult };

export function parseNativeAppInboundMessage(
  input: unknown,
  completeJsonUtf8Bytes?: number
): ParseResult<NativeAppInboundMessage> {
  if (
    completeJsonUtf8Bytes !== undefined &&
    completeJsonUtf8Bytes > NATIVE_HOST_TO_EXTENSION_MAX_MESSAGE_BYTES
  ) {
    return fail('native-message-too-large', 'Native message exceeds host-to-extension limit');
  }

  if (
    completeJsonUtf8Bytes !== undefined &&
    completeJsonUtf8Bytes > NATIVE_MESSAGE_TARGET_MAX_JSON_UTF8_BYTES
  ) {
    return fail('oversized-payload', 'Native message exceeds target JSON budget');
  }

  if (!isRecord(input) || !isString(input['type'])) {
    return fail('malformed-message', 'Native message root must be an object with type');
  }

  return validateMessageByType(input);
}

export function estimateNativeMessageJsonUtf8Bytes(input: unknown): number {
  return new TextEncoder().encode(JSON.stringify(input)).byteLength;
}

export { isNativeTrayActionKind };

export function isNativeAsciiIdentifier(value: unknown): value is string {
  return isAsciiId(value);
}

export function isNativeSafeFilename(value: unknown): value is string {
  return isSafeFilename(value);
}
