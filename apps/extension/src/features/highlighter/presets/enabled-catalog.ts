import type { BorderPreset, HighlighterSettings } from '../contracts';
import { DEFAULT_BORDER_PRESET } from '../style/defaults';

type HighlighterPresetCatalog = Pick<
  HighlighterSettings,
  'borderPresets' | 'defaultBorderPresetId'
>;

export function resolveEnabledBorderPresetCatalog(
  settings: HighlighterPresetCatalog | null | undefined
): HighlighterPresetCatalog {
  const enabledPresets = settings?.borderPresets.filter((preset) => preset.enabled !== false) ?? [];
  const borderPresets = enabledPresets.length > 0 ? enabledPresets : [DEFAULT_BORDER_PRESET];
  const requestedDefault = borderPresets.find(
    (preset) => preset.id === settings?.defaultBorderPresetId
  );
  return {
    borderPresets,
    defaultBorderPresetId: (requestedDefault ?? borderPresets[0]!).id,
  };
}

export function resolveEnabledBorderPreset(
  settings: HighlighterPresetCatalog | null | undefined,
  requestedPresetId?: string | null
): BorderPreset {
  const catalog = resolveEnabledBorderPresetCatalog(settings);
  return (
    catalog.borderPresets.find((preset) => preset.id === requestedPresetId) ??
    catalog.borderPresets.find((preset) => preset.id === catalog.defaultBorderPresetId)!
  );
}
