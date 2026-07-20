import { describe, expect, it } from 'vitest';

import { parseStoredSaveAsDirectory } from './guards';

describe('save-as-directory guards', () => {
  it('returns an empty default for undefined values', () => {
    expect(parseStoredSaveAsDirectory(undefined)).toEqual({
      hasInvalidValue: false,
      value: '',
    });
  });

  it('rejects non-string and unsafe path values', () => {
    expect(parseStoredSaveAsDirectory(42)).toEqual({
      hasInvalidValue: true,
      value: '',
    });
    expect(parseStoredSaveAsDirectory('../escape')).toEqual({
      hasInvalidValue: true,
      value: '',
    });
    expect(parseStoredSaveAsDirectory('/absolute/path')).toEqual({
      hasInvalidValue: true,
      value: '',
    });
  });

  it('accepts relative safe directory paths', () => {
    expect(parseStoredSaveAsDirectory('captures/session-1')).toEqual({
      hasInvalidValue: false,
      value: 'captures/session-1',
    });
  });
});
