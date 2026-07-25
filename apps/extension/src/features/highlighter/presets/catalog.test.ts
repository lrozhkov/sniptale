import { describe, expect, it } from 'vitest';

import {
  createSystemBorderPresetCatalog,
  getCanonicalSystemBorderPreset,
  SYSTEM_BORDER_PRESET_CATALOG_REVISION,
} from './catalog';

describe('system border preset catalog', () => {
  it('owns unique stable keys, ids, and detached canonical snapshots', () => {
    const first = createSystemBorderPresetCatalog();
    const second = createSystemBorderPresetCatalog();

    expect(new Set(first.map((preset) => preset.id)).size).toBe(8);
    expect(new Set(first.map((preset) => preset.systemPresetKey)).size).toBe(8);
    expect(first.every((preset) => preset.id === preset.systemPresetKey)).toBe(true);
    expect(
      first.every(
        (preset) =>
          preset.origin === 'system' &&
          preset.basedOnRevision === SYSTEM_BORDER_PRESET_CATALOG_REVISION &&
          preset.customized === false
      )
    ).toBe(true);

    first[0]!.padding.top = 50;
    expect(second[0]!.padding.top).toBe(3);
    expect(getCanonicalSystemBorderPreset('system-default')?.padding.top).toBe(3);
  });
});
