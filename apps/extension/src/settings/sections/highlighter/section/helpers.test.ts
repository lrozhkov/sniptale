import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

import {
  getHighlighterPresetCountLabel,
  getHighlighterPresetPreviewStyle,
  normalizeHighlighterPresetOrders,
  reorderHighlighterPresets,
} from './helpers';
import {
  BORDER_SHADOW_HARD_INTENSITY,
  BORDER_SHADOW_SOFT_INTENSITY,
} from '../../../../features/highlighter/style';

function createPreset(
  overrides: Partial<Parameters<typeof getHighlighterPresetPreviewStyle>[0]> = {}
) {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Preset',
    isSystemDefault: overrides.isSystemDefault ?? false,
    order: overrides.order ?? 0,
    width: overrides.width ?? 6,
    color: overrides.color ?? '#ff6600',
    style: overrides.style ?? 'solid',
    radius: overrides.radius ?? 10,
    padding: overrides.padding ?? { top: 1, right: 1, bottom: 1, left: 1 },
    shadow: overrides.shadow ?? 0,
    opacity: overrides.opacity ?? 80,
    customCss: overrides.customCss ?? '',
    fillColor: overrides.fillColor ?? '#00000000',
    fillOpacity: overrides.fillOpacity ?? 0,
    inheritCustomCss: overrides.inheritCustomCss ?? false,
    strokeOpacity: overrides.strokeOpacity ?? 100,
  };
}

describe('highlighter-section helpers', () => {
  it('resolves localized count labels for singular, few, and many forms', verifyCountLabels);

  it('builds preview styles for each supported shadow level', verifyPreviewShadowStyles);

  it('reorders presets and returns null when either id is missing', () => {
    const first = createPreset({ id: 'preset-1', order: 0 });
    const second = createPreset({ id: 'preset-2', order: 1 });
    const third = createPreset({ id: 'preset-3', order: 2 });

    expect(reorderHighlighterPresets([first, second], 'missing', 'preset-2')).toBeNull();
    expect(reorderHighlighterPresets([first, second], 'preset-1', 'missing')).toBeNull();
    expect(reorderHighlighterPresets([first, second, third], 'preset-3', 'preset-1')).toEqual([
      expect.objectContaining({ id: 'preset-3', order: 0 }),
      expect.objectContaining({ id: 'preset-1', order: 1 }),
      expect.objectContaining({ id: 'preset-2', order: 2 }),
    ]);
  });

  it('normalizes preset order values from the current array position', () => {
    expect(
      normalizeHighlighterPresetOrders([
        createPreset({ id: 'preset-a', order: 9 }),
        createPreset({ id: 'preset-b', order: 4 }),
      ])
    ).toEqual([
      expect.objectContaining({ id: 'preset-a', order: 0 }),
      expect.objectContaining({ id: 'preset-b', order: 1 }),
    ]);
  });
});

function verifyCountLabels(): void {
  expect(getHighlighterPresetCountLabel(1)).toBe('highlighter.section.countOne');
  expect(getHighlighterPresetCountLabel(2)).toBe('highlighter.section.countFew');
  expect(getHighlighterPresetCountLabel(5)).toBe('highlighter.section.countMany');
}

function verifyPreviewShadowStyles(): void {
  expect(
    getHighlighterPresetPreviewStyle(createPreset({ shadow: BORDER_SHADOW_SOFT_INTENSITY }))
  ).toMatchObject({
    boxShadow: '0 0 6px color-mix(in srgb, #ff6600 40%, transparent)',
    borderRadius: '8px',
    borderWidth: '4px',
  });
  expect(
    getHighlighterPresetPreviewStyle(createPreset({ shadow: BORDER_SHADOW_HARD_INTENSITY }))
  ).toMatchObject({
    boxShadow: '0 0 9px 2px color-mix(in srgb, #ff6600 62%, transparent)',
  });
  expect(getHighlighterPresetPreviewStyle(createPreset({ shadow: 0 }))).toMatchObject({
    boxShadow: undefined,
  });
}
