import { describe, expect, it } from 'vitest';
import { createSystemViewportPresetCatalog } from './catalog';
import {
  createUserViewportPreset,
  groupViewportPresetsForSelector,
  normalizeViewportPresetOrder,
} from './operations';

describe('window-size preset operations', () => {
  it('maintains one ordered window group', () => {
    const reversed = createSystemViewportPresetCatalog().reverse();
    const normalized = normalizeViewportPresetOrder(reversed);
    expect(normalized.map((preset) => preset.target)).toEqual([
      'window',
      'window',
      'window',
      'window',
    ]);
    expect(normalized.map((preset) => preset.order)).toEqual([0, 1, 2, 3]);
    expect(groupViewportPresetsForSelector(normalized)).toEqual([
      { target: 'window', presets: normalized },
    ]);
  });

  it('rejects any custom target other than window', () => {
    expect(() =>
      Reflect.apply(createUserViewportPreset, undefined, [
        {
          height: 720,
          id: 'custom',
          name: 'Custom',
          order: 0,
          target: 'viewport',
          width: 1280,
        },
      ])
    ).toThrow('dimensions or target are invalid');
  });
});
