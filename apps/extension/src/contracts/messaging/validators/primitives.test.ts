import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  hasOptionalField,
  hasRequiredField,
  isBoolean,
  isMessageWithType,
  isNullable,
  isNumber,
  isRecord,
  isString,
} from './primitives';

describe('messaging validator primitives', () => {
  it('re-exports shared primitive validators', () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isString('value')).toBe(true);
    expect(isNumber(1)).toBe(true);
    expect(isBoolean(false)).toBe(true);
    expect(isNullable(isString)(null)).toBe(true);
  });

  it('evaluates required and optional field guards', () => {
    const record = { id: 'entry-1', optional: undefined };

    expect(hasRequiredField(record, 'id', isString)).toBe(true);
    expect(hasOptionalField(record, 'optional', isString)).toBe(true);
    expect(hasOptionalField({ optional: 5 }, 'optional', isString)).toBe(false);
  });

  it('matches typed messaging payloads', () => {
    expect(isMessageWithType({ type: MessageType.EXECUTE_SAVE }, MessageType.EXECUTE_SAVE)).toBe(
      true
    );
    expect(isMessageWithType({ type: MessageType.SHOW_TOOLBAR }, MessageType.EXECUTE_SAVE)).toBe(
      false
    );
  });
});
