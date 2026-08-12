import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoDiagnosticsToggle } from '../diagnostics-toggle';
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
  diagnosticsDisabled: boolean;
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
  diagnosticsDisabled,
  webcamLocked = false,
  onToggleMicrophone,
  onToggleWebcam,
  onSettingsChange,
}: VideoToggleGridProps) {
  const toolbarAvailable = captureMode === CaptureMode.TAB || captureMode === CaptureMode.TAB_CROP;

  return (
    <div
      className={`${VIDEO_TOGGLE_GRID_CLASS_NAME} ${toolbarAvailable ? 'grid-cols-6' : 'grid-cols-5'}`}
    >
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
      {toolbarAvailable ? (
        <VideoRecordingToolbarToggle settings={settings} onSettingsChange={onSettingsChange} />
      ) : null}
      <VideoControlledCursorToggle
        captureMode={captureMode}
        controlledCursorCaptureEnabled={settings.controlledCursorCaptureEnabled}
        disabled={controlledCursorDisabled}
        disabledReason={controlledCursorDisabledReason}
        onSettingsChange={onSettingsChange}
      />
      <VideoDiagnosticsToggle
        settings={settings}
        diagnosticsDisabled={diagnosticsDisabled}
        onSettingsChange={onSettingsChange}
      />
    </div>
  );
}
