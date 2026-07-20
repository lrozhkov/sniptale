import { translate } from '../../../../platform/i18n';
import type { CaptureActionType, SavePreset } from '../../../../contracts/settings';
import { getSettingsCountLabel } from '../../../section-surface/text.helpers';

export function getCaptureActionOptions(): { value: CaptureActionType; label: string }[] {
  return [
    {
      value: 'download_default',
      label: translate('savePresets.section.captureActionDownloadDefault'),
    },
    { value: 'ask_preset', label: translate('savePresets.section.captureActionAskPreset') },
    { value: 'ask_system', label: translate('savePresets.section.captureActionAskSystem') },
    { value: 'edit', label: translate('savePresets.section.captureActionEdit') },
    { value: 'copy', label: translate('savePresets.section.captureActionCopy') },
  ];
}

export function getPresetCountLabel(count: number): string {
  return getSettingsCountLabel(count, {
    one: 'savePresets.section.countOne',
    few: 'savePresets.section.countFew',
    many: 'savePresets.section.countMany',
  });
}

export function isPresetUsed(
  presetId: string,
  defaultImagePresetId: string | null,
  defaultVideoPresetId: string | null,
  defaultExportPresetId: string | null
): boolean {
  return (
    defaultImagePresetId === presetId ||
    defaultVideoPresetId === presetId ||
    defaultExportPresetId === presetId
  );
}

export function reorderPresets(
  presets: SavePreset[],
  draggedId: string,
  targetId: string
): SavePreset[] | null {
  const nextPresets = [...presets];
  const fromIndex = nextPresets.findIndex((preset) => preset.id === draggedId);
  const toIndex = nextPresets.findIndex((preset) => preset.id === targetId);

  if (fromIndex < 0 || toIndex < 0) {
    return null;
  }

  const [removedPreset] = nextPresets.splice(fromIndex, 1);
  if (!removedPreset) {
    return null;
  }
  nextPresets.splice(toIndex, 0, removedPreset);

  return nextPresets.map((preset, index) => ({ ...preset, order: index }));
}
