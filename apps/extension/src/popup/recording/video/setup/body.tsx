import { useState } from 'react';
import { translate } from '../../../../platform/i18n/popup';
import type { ReactNode } from 'react';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import type { ViewportPreset } from '../../../../contracts/settings';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import {
  createVideoRecordingLiveMediaState,
  VideoRecordingStatus,
  type VideoRecordingLiveMediaState,
  type VideoPostRecordResult,
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
  VideoRecordingAreaSelector,
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
  pageAccessControls?: ReactNode;
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
  completionRequestFailed?: boolean;
  onRetryCompletion?: (() => void) | undefined;
  onRefreshRecordingState?: (() => Promise<void>) | undefined;
  postRecordResult?: VideoPostRecordResult | null;
  onAcknowledgePostRecord?: () => Promise<void>;
  viewModel: VideoSetupViewModel;
  idleActions?: ReactNode;
}

export function VideoSetupBody(props: VideoSetupBodyProps) {
  const completion = props.recordingState.completion;
  if (
    !props.showSavingState &&
    ((completion && !completion.pending) ||
      props.completionRequestFailed ||
      (props.recordingState.status === VideoRecordingStatus.STOPPING && props.recordingState.error))
  )
    return <VideoCompletionFailureSection {...props} />;

  if (props.showSavingState) {
    return (
      <VideoSavingSection
        discard={props.showSavingState || props.recordingState.completion?.discard === true}
      />
    );
  }

  if (props.postRecordResult && props.onAcknowledgePostRecord) {
    return <VideoPostRecordSection {...props} />;
  }

  if (props.recordingState.status === VideoRecordingStatus.STOPPING) {
    return (
      <VideoSavingSection
        discard={props.showSavingState || props.recordingState.completion?.discard === true}
      />
    );
  }

  if (props.recordingState.status !== VideoRecordingStatus.IDLE) {
    return <VideoActiveRecordingSection {...props} />;
  }

  return <VideoIdleSetupSection {...props} />;
}

const VIDEO_SETUP_SECTION_CLASS_NAME = [
  'flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[16px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)]',
  'p-3',
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
  const result = props.postRecordResult;
  const onAcknowledge = props.onAcknowledgePostRecord;
  if (!result || !onAcknowledge) {
    return null;
  }

  return (
    <section className={VIDEO_SETUP_SECTION_CLASS_NAME}>
      <VideoPostRecordPanel result={result} onAcknowledge={onAcknowledge} />
    </section>
  );
}

function VideoSavingSection({ discard }: { discard: boolean }) {
  return (
    <section className={VIDEO_SETUP_SECTION_CLASS_NAME}>
      <VideoSavingPanel discard={discard} />
    </section>
  );
}

function VideoIdleSetupSection(props: VideoSetupBodyProps) {
  return (
    <section className={`relative ${VIDEO_SETUP_SECTION_CLASS_NAME}`}>
      <VideoCaptureModeSelector {...props} />
      {props.pageAccessControls ? (
        <div className="min-h-0 flex-1 pt-3">{props.pageAccessControls}</div>
      ) : (
        <VideoIdleSettings {...props} />
      )}
      {props.idleActions ? (
        <div className="mt-auto shrink-0 pt-3" data-ui="popup.video-setup.idle-actions">
          {props.idleActions}
        </div>
      ) : null}
    </section>
  );
}

function VideoIdleSettings(props: VideoSetupBodyProps) {
  return (
    <>
      <VideoToggleGrid
        captureMode={props.captureMode}
        settings={props.settings}
        webcamLocked={props.captureMode === CaptureMode.CAMERA}
        controlledCursorDisabled={props.viewModel.controlledCursorDisabled}
        controlledCursorDisabledReason={props.viewModel.controlledCursorDisabledReason}
        systemAudioDisabled={props.viewModel.systemAudioDisabled}
        onToggleMicrophone={props.onToggleMicrophone}
        onToggleWebcam={props.onToggleWebcam}
        onSettingsChange={props.onSettingsChange}
      />
      <VideoMicrophoneSelector
        settings={props.settings}
        microphoneDevices={props.microphoneDevices}
        isLoadingMicrophones={props.isLoadingMicrophones}
        onMicrophoneDeviceChange={props.onMicrophoneDeviceChange}
        onSettingsChange={props.onSettingsChange}
      />
      <VideoWebcamSelector
        captureMode={props.captureMode}
        required={props.captureMode === CaptureMode.CAMERA}
        settings={props.settings}
        webcamDevices={props.webcamDevices}
        isLoadingWebcams={props.isLoadingWebcams}
        onWebcamDeviceChange={props.onWebcamDeviceChange}
        onSettingsChange={props.onSettingsChange}
      />
      {props.captureMode === CaptureMode.CAMERA ? null : (
        <VideoPresetSelector
          captureMode={props.captureMode}
          viewportPresets={props.viewportPresets}
          selectedPresetId={props.selectedPresetId}
          onPresetChange={props.onPresetChange}
        />
      )}
      <VideoSettingsGrid
        captureMode={props.captureMode}
        knownOutputBasisDimensions={props.viewModel.knownOutputBasisDimensions}
        settings={props.settings}
        onSettingsChange={props.onSettingsChange}
      />
      {props.captureMode === CaptureMode.TAB || props.captureMode === CaptureMode.TAB_CROP ? (
        <VideoRecordingAreaSelector
          captureMode={props.captureMode}
          modeCapabilities={
            props.viewModel.modeCapabilities ?? props.activeTabCapabilities.videoByMode
          }
          onCaptureModeChange={props.onCaptureModeChange}
        />
      ) : null}
      <VideoSetupWarnings startError={props.startError} />
    </>
  );
}

function VideoCaptureModeSelector({
  captureMode,
  onCaptureModeChange,
  viewModel,
}: VideoSetupBodyProps) {
  return (
    <CaptureModeSelector
      captureMode={captureMode}
      {...(viewModel.modeCapabilities ? { modeCapabilities: viewModel.modeCapabilities } : {})}
      onCaptureModeChange={onCaptureModeChange}
    />
  );
}

function VideoCompletionFailureSection(props: VideoSetupBodyProps) {
  const [pending, setPending] = useState(false);
  const outcome = props.recordingState.completion?.outcome ?? 'unknown';
  const retry = outcome !== 'failed' ? props.onRetryCompletion : undefined;
  const action = retry ?? props.onRefreshRecordingState;
  const runAction = async () => {
    if (!action || pending) return;
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  };
  return (
    <section
      className={VIDEO_SETUP_SECTION_CLASS_NAME}
      role="alert"
      data-ui="popup.video-completion.error"
    >
      <div className="m-auto flex max-w-md flex-col items-center gap-3 text-center">
        <h2 className="text-base font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('popup.video.completionIncomplete')}
        </h2>
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate(
            outcome === 'failed'
              ? 'popup.video.completionFailedDescription'
              : outcome === 'stopped'
                ? 'popup.video.completionRetryDescription'
                : 'popup.video.completionUnknownDescription'
          )}
        </p>
        {action ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              void runAction();
            }}
            className={[
              'rounded-[10px] bg-[var(--sniptale-color-surface-canvas)] px-4 py-2',
              'text-xs font-semibold disabled:opacity-50',
            ].join(' ')}
            data-ui="popup.video-completion.retry"
          >
            {translate(
              retry
                ? outcome === 'unknown'
                  ? 'popup.video.completionRetryStop'
                  : 'popup.video.completionRetry'
                : 'popup.video.completionRefresh'
            )}
          </button>
        ) : null}
      </div>
    </section>
  );
}
