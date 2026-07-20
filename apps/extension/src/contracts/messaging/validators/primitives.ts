import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { isClipboardTextWithinLimit } from '@sniptale/runtime-contracts/validation/text';
import {
  isBoolean,
  isNullable,
  isNumber,
  isRecord,
  isString,
} from '@sniptale/runtime-contracts/validation/primitives';
import type { MessageTypeWithString } from '../contracts/types';

export function hasOptionalField(
  record: Record<string, unknown>,
  key: string,
  validator: (value: unknown) => boolean
): boolean {
  return record[key] === undefined || validator(record[key]);
}

export function hasRequiredField(
  record: Record<string, unknown>,
  key: string,
  validator: (value: unknown) => boolean
): boolean {
  return validator(record[key]);
}

export function isMessageWithType<TType extends MessageTypeWithString>(
  input: unknown,
  type: TType
): input is { type: TType } & Record<string, unknown> {
  return isRecord(input) && input['type'] === type;
}

export { isBoolean, isNullable, isNumber, isRecord, isString };
export { isClipboardTextWithinLimit, isImageDataUrl };
