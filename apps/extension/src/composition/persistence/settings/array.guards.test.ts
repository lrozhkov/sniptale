import { describe, expect, it } from 'vitest';

import { parseSavePresets, parseViewportPresets } from './array.guards.ts';
import { createSystemViewportPresetCatalog } from '../../../features/viewport-presets/catalog';

describe('settings array guards', () => {
  it('returns undefined when every viewport preset entry is invalid', () => {
    expect(parseViewportPresets([{ id: 'broken' }])).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 1,
      value: undefined,
    });
  });

  it('accepts only the complete current viewport catalog', () => {
    const catalog = createSystemViewportPresetCatalog();
    expect(parseViewportPresets(catalog)).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 0,
      value: catalog,
    });
    expect(parseViewportPresets(catalog.slice(1))).toEqual({
      hasInvalidRoot: false,
      invalidEntryCount: 9,
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
