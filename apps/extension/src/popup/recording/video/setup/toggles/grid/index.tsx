import { Text } from 'lucide-react';
import { openTeleprompterPage } from '../../../../../../platform/navigation/extension-pages';
import { translate } from '../../../../../../platform/i18n/popup';
import { PopupIconStateButton } from '../../../../../../ui/popup-shell/icon-state-button';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoSystemAudioToggle } from '../system-audio-toggle';
import { VideoControlledCursorToggle } from './controlled-cursor';
import { VideoMicrophoneToggle } from './microphone';
import { VideoRecordingToolbarToggle } from './toolbar-toggle';
import { VideoWebcamToggle } from './webcam';

const VIDEO_TOGGLE_GRID_CLASS_NAME = 'mt-2.5 mr-1 grid gap-1.5';

type VideoToggleGridProps = {
  captureMode: CaptureMode;
  settings: VideoRecordingSettings;
  controlledCursorDisabled: boolean;
  controlledCursorDisabledReason: string | null;
  systemAudioDisabled: boolean;
  webcamLocked?: boolean;
  onToggleMicrophone: () => void;
  onToggleWebcam: () => void;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
};

export function VideoToggleGrid({
  captureMode,
  settings,
  controlledCursorDisabled,
  controlledCursorDisabledReason,
  systemAudioDisabled,
  webcamLocked = false,
  onToggleMicrophone,
  onToggleWebcam,
  onSettingsChange,
}: VideoToggleGridProps) {
  const toolbarAvailable = captureMode === CaptureMode.TAB || captureMode === CaptureMode.TAB_CROP;

  return (
    <div className={`${VIDEO_TOGGLE_GRID_CLASS_NAME} grid-cols-6`}>
      <VideoMicrophoneToggle
        active={settings.microphoneEnabled}
        onToggleMicrophone={onToggleMicrophone}
      />
      <VideoWebcamToggle
        active={settings.webcamEnabled === true || webcamLocked}
        disabled={webcamLocked}
        onToggleWebcam={onToggleWebcam}
      />
      <VideoSystemAudioToggle
        settings={settings}
        systemAudioDisabled={systemAudioDisabled}
        onSettingsChange={onSettingsChange}
      />
      <VideoRecordingToolbarToggle
        settings={settings}
        disabled={!toolbarAvailable}
        onSettingsChange={onSettingsChange}
      />
      <VideoControlledCursorToggle
        captureMode={captureMode}
        controlledCursorCaptureEnabled={settings.controlledCursorCaptureEnabled}
        disabled={controlledCursorDisabled}
        disabledReason={controlledCursorDisabledReason}
        onSettingsChange={onSettingsChange}
      />
      <PopupIconStateButton
        icon={Text}
        label={translate('popup.video.teleprompterLabel')}
        description={translate('popup.video.teleprompterDescription')}
        active={settings.teleprompterEnabled === true}
        onClick={() => {
          const enabled = settings.teleprompterEnabled !== true;
          onSettingsChange({ teleprompterEnabled: enabled });
          if (enabled) void openTeleprompterPage().catch(() => undefined);
        }}
        accentClassName="text-[var(--sniptale-color-accent)]"
        dataUi="popup.video.teleprompter-toggle"
        geometry="square"
        inactiveDecoration="slash"
      />
    </div>
  );
}
