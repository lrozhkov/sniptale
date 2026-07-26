import { describe, expect, it } from 'vitest';

import { createSystemBorderPresetCatalog } from './catalog';
import { getBorderPresetDisplayName } from './display-name';

describe('border preset display name', () => {
  it('resolves untouched system names dynamically from a trusted key', () => {
    const preset = createSystemBorderPresetCatalog()[0]!;

    expect(getBorderPresetDisplayName(preset, 'ru')).toBe('Акцент');
    expect(getBorderPresetDisplayName(preset, 'en')).toBe('Accent');
    expect(preset.name).toBe('system-default');
  });

  it('never translates customized system or user names', () => {
    const source = createSystemBorderPresetCatalog()[0]!;
    const { systemPresetKey: _systemPresetKey, ...userSource } = source;
    const systemPreset = {
      ...source,
      customized: true,
      name: 'Мой акцент',
    };
    const userPreset = {
      ...userSource,
      id: 'user-1',
      name: 'Custom',
      origin: 'user' as const,
    };

    expect(getBorderPresetDisplayName(systemPreset, 'en')).toBe('Мой акцент');
    expect(getBorderPresetDisplayName(userPreset, 'ru')).toBe('Custom');
  });
});
