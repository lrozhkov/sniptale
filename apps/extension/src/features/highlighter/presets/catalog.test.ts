import { describe, expect, it } from 'vitest';

import {
  cloneBorderPreset,
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

  it('clones canonical Paint without retaining shared stop state', () => {
    const source = createSystemBorderPresetCatalog()[0]!;
    const gradientSource = {
      ...source,
      fillPaint: {
        kind: 'gradient' as const,
        gradient: {
          type: 'linear' as const,
          angle: 90,
          interpolation: 'srgb' as const,
          repeat: { enabled: false, span: 1 },
          stops: [
            { id: 'a', color: '#000000ff', position: 0, midpoint: 0.5 },
            { id: 'b', color: '#ffffffff', position: 1, midpoint: 0.5 },
          ],
        },
      },
    };
    const clonedGradient = cloneBorderPreset(gradientSource);
    expect(clonedGradient.fillPaint).not.toBe(gradientSource.fillPaint);
  });
});
