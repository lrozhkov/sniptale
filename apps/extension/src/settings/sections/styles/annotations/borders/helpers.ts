import type { BorderPreset } from '../../../../../features/highlighter/contracts';
import { resolveBorderShadowVisual } from '../../../../../features/highlighter/style';
import { getSettingsCountLabel } from '../../../../section-surface/text.helpers.ts';

export function getHighlighterPresetCountLabel(count: number) {
  return getSettingsCountLabel(count, {
    one: 'highlighter.section.countOne',
    few: 'highlighter.section.countFew',
    many: 'highlighter.section.countMany',
  });
}

export function getHighlighterPresetPreviewStyle(preset: BorderPreset): React.CSSProperties {
  const shadowVisual = resolveBorderShadowVisual(preset.shadow, preset.color);

  return {
    width: '24px',
    height: '24px',
    borderWidth: `${Math.min(preset.width, 4)}px`,
    borderStyle: preset.style,
    borderColor: preset.color,
    borderRadius: `${Math.min(preset.radius, 8)}px`,
    backgroundColor: preset.fillColor,
    boxShadow: shadowVisual.settingsRowBoxShadow,
  };
}

export function normalizeHighlighterPresetOrders(presets: BorderPreset[]) {
  return presets.map((preset, index) => ({ ...preset, order: index }));
}

export function reorderHighlighterPresetsBefore(
  presets: BorderPreset[],
  presetId: string,
  beforePresetId: string | null
) {
  const next = presets.filter((preset) => preset.id !== presetId);
  const moved = presets.find((preset) => preset.id === presetId);
  if (!moved) return null;
  const target =
    beforePresetId === null
      ? next.length
      : next.findIndex((preset) => preset.id === beforePresetId);
  if (target < 0) return null;
  next.splice(target, 0, moved);
  return normalizeHighlighterPresetOrders(next);
}
