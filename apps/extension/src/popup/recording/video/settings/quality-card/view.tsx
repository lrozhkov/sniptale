import { translate } from '../../../../../platform/i18n';
import {
  getVideoRecordingProfile,
  type VideoRecordingSettings,
  type VideoOutputDimensions,
} from '@sniptale/runtime-contracts/video/types/types';
import { InlineCurtainSelect } from '../../../../../ui/popup-shell/inline-curtain/select';
import { OutputSettingsPanel } from '../output-card/panel';
import { getRecordingProfileOptions } from './options';

export function QualityCard({
  knownOutputBasisDimensions,
  settings,
  onSettingsChange,
}: {
  knownOutputBasisDimensions?: VideoOutputDimensions | null;
  settings: VideoRecordingSettings;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  const profileState = getRecordingProfileOptions(settings, knownOutputBasisDimensions ?? null);

  return (
    <InlineCurtainSelect
      ariaLabel={translate('popup.video.qualityAria')}
      label={translate('popup.video.qualityLabel')}
      onChange={(profileId) => {
        const profile = getVideoRecordingProfile(settings, profileId);
        if (profile) {
          onSettingsChange({
            outputProfile: { ...profile.configuration },
            qualityProfileId: profile.id,
          });
        }
      }}
      options={profileState.options}
      secondaryAction={{
        ariaLabel: translate('popup.video.outputSettingsActionAria'),
        label: translate('popup.video.outputSettingsAction'),
        panel: (
          <OutputSettingsPanel
            knownOutputBasisDimensions={knownOutputBasisDimensions ?? null}
            settings={settings}
            onChange={onSettingsChange}
          />
        ),
      }}
      value={profileState.selectedProfileId}
    />
  );
}
