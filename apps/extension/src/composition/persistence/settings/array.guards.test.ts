import { describe, expect, it } from 'vitest';

import { parseSavePresets, parseViewportPresets } from './array.guards.ts';

describe('settings array guards', () => {
  it('returns undefined when every viewport preset entry is invalid', () => {
    expect(parseViewportPresets([{ id: 'broken' }])).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 1,
      value: undefined,
    });
  });

  it('keeps valid save presets and counts invalid siblings', () => {
    expect(
      parseSavePresets([
        { id: 'preset-1', name: 'Downloads', path: '/tmp', enabled: true, order: 1 },
        { id: 'broken' },
      ])
    ).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 1,
      value: [{ id: 'preset-1', name: 'Downloads', path: '/tmp', enabled: true, order: 1 }],
    });
  });
});
