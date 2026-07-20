import { translate } from '../../../../../platform/i18n';
import type { ViewportPreset } from '../../../../../contracts/settings';
import { InlineCurtainSelect } from '../../inline-controls/curtain-select';

export function VideoPresetSelector({
  hidden = false,
  viewportPresets,
  selectedPresetId,
  onPresetChange,
}: {
  hidden?: boolean;
  viewportPresets: ViewportPreset[];
  selectedPresetId: string | null;
  onPresetChange: (presetId: string | null) => Promise<void> | void;
}) {
  if (hidden) {
    return null;
  }

  const options = [
    {
      value: '',
      label: translate('popup.video.presetNativeLabel'),
      description: translate('popup.video.presetNativeDescription'),
    },
    ...viewportPresets.map((preset) => ({
      value: preset.id,
      label: preset.label || `${preset.width}×${preset.height}`,
      description: `${preset.width}×${preset.height}`,
    })),
  ];

  return (
    <InlineCurtainSelect
      value={selectedPresetId ?? ''}
      label={translate('popup.video.presetRowLabel')}
      ariaLabel={translate('popup.video.presetRowAria')}
      options={options}
      onChange={(value) => {
        void onPresetChange(value || null);
      }}
    />
  );
}
