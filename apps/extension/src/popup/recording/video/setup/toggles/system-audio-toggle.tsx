import { Volume2 } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../ui/popup-shell/icon-state-button';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export function VideoSystemAudioToggle({
  settings,
  systemAudioDisabled,
  onSettingsChange,
}: {
  settings: VideoRecordingSettings;
  systemAudioDisabled: boolean;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  return (
    <PopupIconStateButton
      icon={Volume2}
      label={
        systemAudioDisabled
          ? translate('popup.video.systemAudioDisabledLabel')
          : translate('popup.video.systemAudioLabel')
      }
      description={
        systemAudioDisabled
          ? translate('popup.video.systemAudioDisabledDescription')
          : translate('popup.video.systemAudioDescription')
      }
      active={!systemAudioDisabled && settings.systemAudioEnabled}
      disabled={systemAudioDisabled}
      onClick={() => onSettingsChange({ systemAudioEnabled: !settings.systemAudioEnabled })}
      accentClassName="text-[var(--sniptale-color-accent)]"
      geometry="square"
      inactiveDecoration="slash"
    />
  );
}
