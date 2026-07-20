import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { ViewportPreset } from '../../../../contracts/settings';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  createVideoRecordingLiveMediaState,
  VideoRecordingStatus,
  type VideoRecordingLiveMediaState,
  type VideoRecordingRuntimeState,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoSettingsGrid } from '../settings';
import { VideoSetupWarnings } from '../footer';
import { VideoToggleGrid } from './toggles/grid';
import { VideoSetupRecordingPanel } from './panel';
import { VideoPostRecordPanel } from '../post-record/panel';
import { VideoSavingPanel } from '../post-record/saving';
import {
  CaptureModeSelector,
  VideoMicrophoneSelector,
  VideoPresetSelector,
  VideoWebcamSelector,
} from './options';
import type { VideoSetupViewModel } from './types';

function resolveDeviceLabel(
  deviceId: string | null | undefined,
  devices: Array<{ deviceId: string; label: string }>
): string | null {
  if (!deviceId) {
    return null;
  }

  return devices.find((device) => device.deviceId === deviceId)?.label ?? null;
}

function resolveLiveMediaState(
  recordingState: VideoRecordingRuntimeState,
  settings: VideoRecordingSettings
): VideoRecordingLiveMediaState {
  return recordingState.liveMedia ?? createVideoRecordingLiveMediaState(settings);
}

interface VideoSetupBodyProps {
  settings: VideoRecordingSettings;
  captureMode: CaptureMode;
  selectedPresetId: string | null;
  viewportPresets: ViewportPreset[];
  microphoneDevices: Array<{ deviceId: string; label: string }>;
  isLoadingMicrophones: boolean;
  webcamDevices: Array<{ deviceId: string; label: string }>;
  isLoadingWebcams: boolean;
  startError: string | null;
  pageAccessDisabledReason?: string | null;
  activeTabCapabilities: ActiveTabCapabilities;
  recordingState: VideoRecordingRuntimeState;
  onCaptureModeChange: (mode: CaptureMode) => void;
  onPresetChange: (presetId: string | null) => Promise<void> | void;
  onMicrophoneDeviceChange: (microphoneDeviceId: string | null) => void;
  onToggleMicrophone: () => void;
  onWebcamDeviceChange: (webcamDeviceId: string | null) => void;
  onToggleWebcam: () => void;
  onActiveRecordingSettingsChange: (patch: Partial<VideoRecordingSettings>) => Promise<void>;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
  showSavingState?: boolean;
  postRecordRecordingId?: string | null;
  onClosePostRecord?: () => void;
  viewModel: VideoSetupViewModel;
}

export function VideoSetupBody(props: VideoSetupBodyProps) {
  if (props.showSavingState || props.recordingState.status === VideoRecordingStatus.STOPPING) {
    return <VideoSavingSection />;
  }

  if (props.recordingState.status !== VideoRecordingStatus.IDLE) {
    return <VideoActiveRecordingSection {...props} />;
  }

  if (props.postRecordRecordingId && props.onClosePostRecord) {
    return <VideoPostRecordSection {...props} />;
  }

  return <VideoIdleSetupSection {...props} />;
}

const VIDEO_SETUP_SECTION_CLASS_NAME = [
  'flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[16px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)]',
  'p-3 pr-2',
].join(' ');

function VideoActiveRecordingSection(props: VideoSetupBodyProps) {
  const liveMedia = resolveLiveMediaState(props.recordingState, props.settings);

  return (
    <section className={VIDEO_SETUP_SECTION_CLASS_NAME}>
      <VideoSetupRecordingPanel
        recordingState={props.recordingState}
        mediaSelection={{
          microphoneDeviceId: liveMedia.microphoneDeviceId,
          microphoneEnabled: liveMedia.microphoneEnabled,
          microphoneSelected: liveMedia.microphoneSelected,
          microphoneLabel: resolveDeviceLabel(
            liveMedia.microphoneDeviceId,
            props.microphoneDevices
          ),
          webcamDeviceId: liveMedia.webcamDeviceId,
          webcamEnabled: liveMedia.webcamEnabled,
          webcamSelected: liveMedia.webcamSelected,
          webcamSettings: liveMedia.webcamSettings ?? null,
          webcamLabel: resolveDeviceLabel(liveMedia.webcamDeviceId, props.webcamDevices),
        }}
        onActiveRecordingSettingsChange={props.onActiveRecordingSettingsChange}
      />
    </section>
  );
}

function VideoPostRecordSection(props: VideoSetupBodyProps) {
  return (
    <section className={VIDEO_SETUP_SECTION_CLASS_NAME}>
      <VideoPostRecordPanel
        recordingId={props.postRecordRecordingId ?? ''}
        onClose={props.onClosePostRecord ?? (() => undefined)}
      />
    </section>
  );
}

function VideoSavingSection() {
  return (
    <section className={VIDEO_SETUP_SECTION_CLASS_NAME}>
      <VideoSavingPanel />
    </section>
  );
}

function VideoIdleSetupSection(props: VideoSetupBodyProps) {
  return (
    <section className={`relative ${VIDEO_SETUP_SECTION_CLASS_NAME}`}>
      <VideoSetupModeSections {...props} />
      <VideoMicrophoneSelector
        settings={props.settings}
        microphoneDevices={props.microphoneDevices}
        isLoadingMicrophones={props.isLoadingMicrophones}
        onMicrophoneDeviceChange={props.onMicrophoneDeviceChange}
        onSettingsChange={props.onSettingsChange}
      />
      <VideoWebcamSelector
        settings={props.settings}
        webcamDevices={props.webcamDevices}
        isLoadingWebcams={props.isLoadingWebcams}
        onWebcamDeviceChange={props.onWebcamDeviceChange}
        onSettingsChange={props.onSettingsChange}
      />
      <VideoPresetSelector
        viewportPresets={props.viewportPresets}
        selectedPresetId={props.selectedPresetId}
        onPresetChange={props.onPresetChange}
        hidden={props.captureMode === CaptureMode.CAMERA}
      />
      <VideoSettingsGrid
        captureMode={props.captureMode}
        settings={props.settings}
        onSettingsChange={props.onSettingsChange}
      />
      <VideoSetupWarnings startError={props.startError} />
    </section>
  );
}

function VideoSetupModeSections({
  captureMode,
  onCaptureModeChange,
  settings,
  onToggleMicrophone,
  onToggleWebcam,
  onSettingsChange,
  viewModel,
}: VideoSetupBodyProps) {
  return (
    <>
      <CaptureModeSelector
        captureMode={captureMode}
        {...(viewModel.modeCapabilities ? { modeCapabilities: viewModel.modeCapabilities } : {})}
        onCaptureModeChange={onCaptureModeChange}
      />
      <VideoToggleGrid
        captureMode={captureMode}
        settings={settings}
        webcamLocked={captureMode === CaptureMode.CAMERA}
        controlledCursorDisabled={viewModel.controlledCursorDisabled}
        controlledCursorDisabledReason={viewModel.controlledCursorDisabledReason}
        systemAudioDisabled={viewModel.systemAudioDisabled}
        diagnosticsDisabled={viewModel.diagnosticsDisabled}
        onToggleMicrophone={onToggleMicrophone}
        onToggleWebcam={onToggleWebcam}
        onSettingsChange={onSettingsChange}
      />
    </>
  );
}
