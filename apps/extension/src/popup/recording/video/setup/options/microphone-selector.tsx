import { translate } from '../../../../../platform/i18n';
import { type VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMediaDeviceSelector } from './media-device-selector';
import { MicrophoneSettingsPanel } from './microphone-settings-panel';

export function VideoMicrophoneSelector({
  settings,
  microphoneDevices,
  isLoadingMicrophones,
  onMicrophoneDeviceChange,
  onSettingsChange,
}: {
  settings: VideoRecordingSettings;
  microphoneDevices: Array<{ deviceId: string; label: string }>;
  isLoadingMicrophones: boolean;
  onMicrophoneDeviceChange: (microphoneDeviceId: string | null) => void;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  if (!settings.microphoneEnabled) {
    return null;
  }

  return (
    <VideoMediaDeviceSelector
      label={translate('popup.video.microphoneRowLabel')}
      ariaLabel={translate('popup.video.microphoneRowAria')}
      currentDeviceId={settings.microphoneDeviceId}
      devices={microphoneDevices}
      emptyText={translate('popup.video.microphoneEmpty')}
      isLoading={isLoadingMicrophones}
      loadingText={translate('popup.video.microphoneLoading')}
      onDeviceChange={onMicrophoneDeviceChange}
      placeholder={translate('popup.video.microphonePlaceholder')}
      secondaryAction={{
        ariaLabel: translate('popup.video.microphoneSettingsActionAria'),
        disabled: !settings.microphoneDeviceId,
        label: translate('popup.video.microphoneSettingsAction'),
        panel: (
          <MicrophoneSettingsPanel
            currentDeviceId={settings.microphoneDeviceId}
            currentDeviceLabel={
              microphoneDevices.find((device) => device.deviceId === settings.microphoneDeviceId)
                ?.label ?? null
            }
            settings={settings}
            onSettingsChange={onSettingsChange}
          />
        ),
      }}
      selectAriaLabel={translate('popup.video.microphoneAria')}
    />
  );
}
