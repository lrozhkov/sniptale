import { describe, expect, it } from 'vitest';

import type { BorderPreset } from '../contracts';
import { DEFAULT_BORDER_PRESET } from '../style/defaults';
import { resolveEnabledBorderPreset, resolveEnabledBorderPresetCatalog } from './enabled-catalog';

function createPreset(id: string, enabled = true): BorderPreset {
  return { ...DEFAULT_BORDER_PRESET, enabled, id, name: id };
}

describe('enabled border preset catalog', () => {
  it('uses one fallback policy for disabled requested and default presets', () => {
    const disabled = createPreset('disabled', false);
    const enabled = createPreset('enabled');
    const settings = {
      borderPresets: [disabled, enabled],
      defaultBorderPresetId: disabled.id,
    };

    expect(resolveEnabledBorderPresetCatalog(settings)).toEqual({
      borderPresets: [enabled],
      defaultBorderPresetId: enabled.id,
    });
    expect(resolveEnabledBorderPreset(settings, disabled.id)).toBe(enabled);
  });

  it('falls back to the built-in preset when storage has no enabled entries', () => {
    const catalog = resolveEnabledBorderPresetCatalog({
      borderPresets: [createPreset('disabled', false)],
      defaultBorderPresetId: 'disabled',
    });

    expect(catalog.defaultBorderPresetId).toBe(DEFAULT_BORDER_PRESET.id);
    expect(resolveEnabledBorderPreset(catalog, null).id).toBe(DEFAULT_BORDER_PRESET.id);
  });
});
