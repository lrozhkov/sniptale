import { translate } from '../../../../../platform/i18n';
import {
  getVideoRecordingQualityProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { InlineCurtainSelect } from '../../inline-controls/curtain-select';
import { OutputSettingsPanel } from '../output-card/panel';
import { getRecordingProfileOptions } from './options';

export function QualityCard({
  settings,
  onSettingsChange,
}: {
  settings: VideoRecordingSettings;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  const profileState = getRecordingProfileOptions(settings);

  return (
    <InlineCurtainSelect
      ariaLabel={translate('popup.video.qualityAria')}
      label={translate('popup.video.qualityLabel')}
      onChange={(profileId) => {
        const profile = getVideoRecordingQualityProfile(settings, profileId);
        if (profile) {
          onSettingsChange({
            output: { ...profile.output },
            quality: profile.quality,
            qualityProfileId: profile.id,
          });
        }
      }}
      options={profileState.options}
      secondaryAction={{
        ariaLabel: translate('popup.video.outputSettingsActionAria'),
        label: translate('popup.video.outputSettingsAction'),
        panel: <OutputSettingsPanel settings={settings} onChange={onSettingsChange} />,
      }}
      value={profileState.selectedProfileId}
    />
  );
}
