import { translate } from '../../../../../platform/i18n';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { InlineCurtainSelect } from '../../inline-controls/curtain-select';
import { QUALITY_OPTIONS, getQualityOption } from './options';

export function QualityCard({
  settings,
  onSettingsChange,
}: {
  settings: VideoRecordingSettings;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  const qualityOption = getQualityOption(settings.quality);

  return (
    <InlineCurtainSelect
      ariaLabel={translate('popup.video.qualityAria')}
      label={translate('popup.video.qualityLabel')}
      onChange={(quality) =>
        onSettingsChange({
          quality: quality as VideoRecordingSettings['quality'],
        })
      }
      options={QUALITY_OPTIONS.map((option) => {
        const translated = getQualityOption(option.value);

        return {
          value: option.value,
          label: translated.label,
          description: translated.description,
        };
      })}
      value={qualityOption.value}
    />
  );
}
