import type { BorderPreset, HighlighterSettings } from '../contracts';

export function createSessionVisibleBorderPresetIds(settings: HighlighterSettings): string[] {
  return settings.borderPresets
    .filter((preset) => preset.enabled !== false)
    .map((preset) => preset.id);
}

export function mergeSessionVisibleBorderPresetIds(
  currentIds: readonly string[],
  settings: HighlighterSettings,
  revealPresetId?: string
): string[] {
  return [
    ...new Set([
      ...currentIds,
      ...createSessionVisibleBorderPresetIds(settings),
      ...(revealPresetId ? [revealPresetId] : []),
    ]),
  ];
}

export function selectSessionVisibleBorderPresets(
  settings: HighlighterSettings,
  visibleIds: readonly string[]
): BorderPreset[] {
  const visible = new Set(visibleIds);
  return settings.borderPresets.filter((preset) => visible.has(preset.id));
}
