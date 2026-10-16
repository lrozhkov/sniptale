import { Mic } from 'lucide-react';
import { useCommandPress } from '@sniptale/ui/control-language/press';
import { translate } from '../../platform/i18n';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { CameraPreview } from './camera-preview';
import { formatDuration, getRecordingStatusLabel, resolveDeviceName } from './format';
import type { ControlCapability, DeviceLabelMap, RuntimeControlMessage } from './types';

const LIVE_PANEL_CLASS = [
  'flex min-h-0 flex-1 flex-col rounded-[4px]',
  'border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-3',
].join(' ');

const LIVE_DETAILS_CLASS = [
  'mt-3 grid shrink-0 gap-3 border-t border-[var(--sniptale-color-border-soft)] pt-3',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const MICROPHONE_PANEL_CLASS = ['flex min-w-0 items-center gap-2 text-left'].join(' ');

const MUTE_BUTTON_CLASS =
  'inline-flex size-8 shrink-0 items-center justify-center disabled:opacity-40';

const STATUS_CLASS = [
  'shrink-0 select-text text-[12px] leading-4 font-normal',
  'text-[var(--sniptale-color-text-secondary)]',
].join(' ');

export function CameraLivePanel(props: {
  capability: ControlCapability | null;
  deviceLabels: DeviceLabelMap;
  error: string | null;
  onControl: (message: RuntimeControlMessage) => void;
  registrationError: string | null;
  state: VideoRecordingRuntimeState;
}) {
  const media = resolveLiveMedia(props.state, props.deviceLabels);

  return (
    <section className={LIVE_PANEL_CLASS} aria-labelledby="camera-recorder-title">
      <CameraPreview webcamDeviceId={media.webcamDeviceId} />
      <CameraLiveDetails
        capability={props.capability}
        error={props.error ?? props.registrationError}
        media={media}
        onControl={props.onControl}
        state={props.state}
      />
    </section>
  );
}

function CameraLiveDetails(props: {
  capability: ControlCapability | null;
  error: string | null;
  media: ResolvedLiveMedia;
  onControl: (message: RuntimeControlMessage) => void;
  state: VideoRecordingRuntimeState;
}) {
  return (
    <div className={LIVE_DETAILS_CLASS}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 id="camera-recorder-title" className="m-0 text-[14px] leading-5 font-semibold">
            {translate('popup.video.cameraWindowTitle')}
          </h1>
          <div className="mt-0.5 text-[12px] leading-4 font-normal text-[var(--sniptale-color-text-muted-strong)]">
            {props.state.status === VideoRecordingStatus.PREPARING
              ? translate('popup.video.cameraWindowPreparing')
              : translate('popup.video.modeCameraHint')}
          </div>
        </div>
        <div role="status" className={STATUS_CLASS}>
          {getRecordingStatusLabel(props.state.status)}
        </div>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <CameraNameBlock webcamLabel={props.media.webcamLabel} />
        <MicrophoneBlock
          capability={props.capability}
          media={props.media}
          onControl={props.onControl}
        />
        <div
          role="timer"
          aria-live="off"
          className="select-text text-2xl font-bold leading-none tabular-nums
            text-[var(--sniptale-color-danger)] md:text-right"
        >
          {formatDuration(props.state.duration)}
        </div>
      </div>

      {props.error ? (
        <div
          role="alert"
          className="select-text text-[14px] leading-5 font-normal
          [overflow-wrap:anywhere] text-[var(--sniptale-color-danger)]"
        >
          {props.error}
        </div>
      ) : null}
    </div>
  );
}

function CameraNameBlock({ webcamLabel }: { webcamLabel: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] leading-4 font-normal text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.activeWebcamLabel')}
      </div>
      <div
        className="mt-0.5 max-w-[680px] select-text truncate text-[13px] leading-[18px] font-medium"
        title={webcamLabel}
      >
        {webcamLabel}
      </div>
    </div>
  );
}

type ResolvedLiveMedia = {
  microphoneEnabled: boolean;
  microphoneLabel: string;
  microphoneSelected: boolean;
  webcamDeviceId: string | null;
  webcamLabel: string;
};

function MicrophoneBlock(props: {
  capability: ControlCapability | null;
  media: ResolvedLiveMedia;
  onControl: (message: RuntimeControlMessage) => void;
}) {
  const capability = props.capability;
  const disabled = !capability || !props.media.microphoneSelected;
  const press = useCommandPress({
    disabled,
    onClick: () => {
      if (capability) {
        props.onControl(createMuteToggleMessage(capability, props.media.microphoneEnabled));
      }
    },
  });
  return (
    <div className={MICROPHONE_PANEL_CLASS}>
      <Mic className="size-4 shrink-0 text-[var(--sniptale-color-text-muted-strong)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] leading-4 font-normal text-[var(--sniptale-color-text-muted-strong)]">
          {translate('popup.video.activeMicrophoneLabel')}
        </div>
        <div
          className="select-text truncate text-[13px] leading-[18px] font-medium"
          title={props.media.microphoneLabel}
        >
          {props.media.microphoneLabel}
        </div>
      </div>
      <button
        {...press.props}
        type="button"
        data-command-press=""
        data-command-tone="toggle"
        data-command-property="true"
        data-active={props.media.microphoneEnabled ? 'true' : 'false'}
        data-pressing={press.pressed ? 'true' : undefined}
        aria-pressed={props.media.microphoneEnabled}
        aria-label={resolveMuteTitle(props.media.microphoneEnabled)}
        className={MUTE_BUTTON_CLASS}
        disabled={disabled}
        title={resolveMuteTitle(props.media.microphoneEnabled)}
      >
        <span className="sniptale-command-content">
          <Mic className="size-4" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}

function createMuteToggleMessage(
  capability: ControlCapability,
  microphoneEnabled: boolean
): RuntimeControlMessage {
  return {
    type: VideoMessageType.UPDATE_SETTINGS,
    controlToken: capability.controlToken,
    recordingId: capability.recordingId,
    settings: { microphoneEnabled: !microphoneEnabled },
  };
}

function resolveMuteTitle(microphoneEnabled: boolean): string {
  return microphoneEnabled
    ? translate('popup.video.activeMicrophoneMute')
    : translate('popup.video.activeMicrophoneUnmute');
}

function resolveLiveMedia(
  state: VideoRecordingRuntimeState,
  deviceLabels: DeviceLabelMap
): ResolvedLiveMedia {
  const liveMedia = state.liveMedia;
  const microphoneEnabled = liveMedia?.microphoneEnabled === true;
  return {
    microphoneEnabled,
    microphoneLabel: microphoneEnabled
      ? resolveDeviceName(
          liveMedia?.microphoneDeviceId,
          deviceLabels.microphones,
          translate('popup.video.activeMicrophoneLabel')
        )
      : translate('popup.video.cameraWindowNoMicrophone'),
    microphoneSelected: liveMedia?.microphoneSelected === true,
    webcamDeviceId: liveMedia?.webcamSelected === true ? (liveMedia.webcamDeviceId ?? null) : null,
    webcamLabel: resolveDeviceName(
      liveMedia?.webcamDeviceId,
      deviceLabels.webcams,
      translate('popup.video.activeWebcamNotSelected')
    ),
  };
}
