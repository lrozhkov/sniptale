import type { BorderPreset } from '../../../../features/highlighter/contracts';
import { resolveBorderShadowVisual } from '../../../../features/highlighter/style';
import { getSettingsCountLabel } from '../../../section-surface/text.helpers';

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
    opacity: preset.opacity / 100,
    boxShadow: shadowVisual.settingsRowBoxShadow,
  };
}

export function normalizeHighlighterPresetOrders(presets: BorderPreset[]) {
  return presets.map((preset, index) => ({ ...preset, order: index }));
}

export function reorderHighlighterPresets(
  presets: BorderPreset[],
  draggedId: string,
  targetId: string
) {
  const nextPresets = [...presets];
  const draggedIndex = nextPresets.findIndex((preset) => preset.id === draggedId);
  const targetIndex = nextPresets.findIndex((preset) => preset.id === targetId);

  if (draggedIndex < 0 || targetIndex < 0) {
    return null;
  }

  const [removed] = nextPresets.splice(draggedIndex, 1);
  if (!removed) {
    return null;
  }
  nextPresets.splice(targetIndex, 0, removed);
  return normalizeHighlighterPresetOrders(nextPresets);
}
