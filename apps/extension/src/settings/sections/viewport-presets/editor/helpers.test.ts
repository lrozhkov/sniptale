import { describe, expect, it } from 'vitest';

import { clampViewportDimension, resolveViewportPresetSubmitLabel } from './helpers';

describe('viewport preset editor helpers', () => {
  it('clamps viewport dimensions into the allowed range', () => {
    expect(clampViewportDimension('0', 3840)).toBe(1);
    expect(clampViewportDimension('5000', 3840)).toBe(3840);
    expect(clampViewportDimension('1280', 3840)).toBe(1280);
  });

  it('resolves submit labels for create, save, and saving states', () => {
    expect(resolveViewportPresetSubmitLabel({ isSaving: true })).toBeTruthy();
    expect(
      resolveViewportPresetSubmitLabel({
        isSaving: false,
        preset: { id: 'preset-1', label: 'Desktop', width: 1920, height: 1080 },
      })
    ).toBeTruthy();
    expect(resolveViewportPresetSubmitLabel({ isSaving: false })).toBeTruthy();
  });
});
