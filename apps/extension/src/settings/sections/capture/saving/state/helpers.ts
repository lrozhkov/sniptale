import { translate } from '../../../../../platform/i18n';
import type { CaptureActionType, SavePreset } from '../../../../../contracts/settings';

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
    {
      value: 'save_to_library',
      label: translate('savePresets.section.captureActionSaveToLibrary'),
    },
  ];
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

export function reorderPresetsBefore(
  presets: SavePreset[],
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
  return next.map((preset, order) => ({ ...preset, order }));
}
