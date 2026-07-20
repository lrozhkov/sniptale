import { expect, it, vi } from 'vitest';

import {
  parseStoredBooleanFlag,
  parseStoredStringList,
  resolveStoredBooleanFlag,
} from './ui-state-validation';

it('parses shared primitive persisted UI-state values', () => {
  expect(parseStoredBooleanFlag(true)).toBe(true);
  expect(parseStoredBooleanFlag('true')).toBeNull();
  expect(parseStoredStringList(['one', 2, 'three'], 2)).toEqual({
    hasInvalidRoot: false,
    invalidEntryCount: 1,
    value: ['one', 'three'],
  });
  expect(parseStoredStringList({}, 2)).toEqual({
    hasInvalidRoot: true,
    invalidEntryCount: 0,
    value: [],
  });
});

it('resolves stored boolean flags and reports only invalid persisted values', () => {
  const reportInvalid = vi.fn();

  expect(resolveStoredBooleanFlag({ flag: true }, 'flag', reportInvalid)).toBe(true);
  expect(resolveStoredBooleanFlag({}, 'flag', reportInvalid)).toBe(false);
  expect(resolveStoredBooleanFlag({ flag: 'true' }, 'flag', reportInvalid)).toBe(false);
  expect(reportInvalid).toHaveBeenCalledOnce();
  expect(reportInvalid).toHaveBeenCalledWith('flag');
});
