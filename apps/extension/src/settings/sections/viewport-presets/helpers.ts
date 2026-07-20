import { translate } from '../../../platform/i18n';
import type { ViewportPreset } from '../../../contracts/settings';
import { getSettingsCountLabel } from '../../section-surface/text.helpers';

export function updateViewportPreset(
  presets: ViewportPreset[],
  editingPreset: ViewportPreset,
  label: string,
  width: number,
  height: number
): ViewportPreset[] {
  return presets.map((preset) =>
    preset.id === editingPreset.id ? { ...preset, label, width, height } : preset
  );
}

export function createViewportPreset(label: string, width: number, height: number): ViewportPreset {
  return {
    id: crypto.randomUUID(),
    label,
    width,
    height,
  };
}

export function getDeleteMessage(label?: string): string {
  return (
    `${translate('viewportPresets.section.deleteMessagePrefix')} "${label ?? ''}"` +
    `${translate('viewportPresets.section.deleteMessageSuffix')}`
  );
}

export function getViewportPresetCountLabel(count: number): string {
  return getSettingsCountLabel(count, {
    one: 'viewportPresets.section.countOne',
    few: 'viewportPresets.section.countFew',
    many: 'viewportPresets.section.countMany',
  });
}
