import { translate } from '../../../../../platform/i18n/popup';
import {
  type CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoMediaDeviceSelector } from './media-device-selector';
import { WebcamSettingsPanel } from './webcam-settings-panel';

export function VideoWebcamSelector({
  captureMode,
  required = false,
  settings,
  webcamDevices,
  isLoadingWebcams,
  onWebcamDeviceChange,
  onSettingsChange,
}: {
  captureMode: CaptureMode;
  required?: boolean;
  settings: VideoRecordingSettings;
  webcamDevices: Array<{ deviceId: string; label: string }>;
  isLoadingWebcams: boolean;
  onWebcamDeviceChange: (webcamDeviceId: string | null) => void;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  if (!settings.webcamEnabled && !required) {
    return null;
  }

  return (
    <VideoMediaDeviceSelector
      label={translate('popup.video.webcamRowLabel')}
      ariaLabel={translate('popup.video.webcamRowAria')}
      currentDeviceId={settings.webcamDeviceId ?? null}
      devices={webcamDevices}
      emptyText={translate('popup.video.webcamEmpty')}
      isLoading={isLoadingWebcams}
      loadingText={translate('popup.video.webcamLoading')}
      onDeviceChange={onWebcamDeviceChange}
      placeholder={translate('popup.video.webcamPlaceholder')}
      secondaryAction={{
        ariaLabel: translate('popup.video.webcamSettingsActionAria'),
        disabled: !settings.webcamDeviceId,
        label: translate('popup.video.webcamSettingsAction'),
        panel: (
          <WebcamSettingsPanel
            captureMode={captureMode}
            currentDeviceId={settings.webcamDeviceId ?? null}
            settings={settings}
            onSettingsChange={onSettingsChange}
          />
        ),
      }}
      selectAriaLabel={translate('popup.video.webcamAria')}
    />
  );
}
