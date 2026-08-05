import { useRef } from 'react';

export function prioritizeActivePreset<Preset extends { id: string }>(
  presets: readonly Preset[],
  activePresetId: string | undefined
): Preset[] {
  if (!activePresetId) return [...presets];
  const activeIndex = presets.findIndex((preset) => preset.id === activePresetId);
  if (activeIndex <= 0) return [...presets];
  return [
    presets[activeIndex]!,
    ...presets.slice(0, activeIndex),
    ...presets.slice(activeIndex + 1),
  ];
}

/**
 * Pins the preset that was active when this list was mounted. Preset sections
 * unmount with their popover, so reopening creates a new order while choosing
 * another preset during the current session does not make the list jump.
 */
export function useOpeningPresetOrder<Preset extends { id: string }>(
  presets: readonly Preset[],
  activePresetId: string | undefined
): Preset[] {
  const openingActivePresetId = useRef(activePresetId);
  return prioritizeActivePreset(presets, openingActivePresetId.current);
}
