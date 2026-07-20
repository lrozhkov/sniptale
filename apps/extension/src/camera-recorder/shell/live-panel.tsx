import { Mic } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { CameraPreview } from './camera-preview';
import { formatDuration, getRecordingStatusLabel, resolveDeviceName } from './format';
import type { ControlCapability, DeviceLabelMap, RuntimeControlMessage } from './types';

const LIVE_PANEL_CLASS = [
  'flex min-h-0 flex-1 flex-col rounded-[18px]',
  'border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-5',
].join(' ');

const LIVE_DETAILS_CLASS = [
  'mt-3 grid gap-3 border-t border-[var(--sniptale-color-border-soft)] pt-3',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');

const MICROPHONE_PANEL_CLASS = ['flex min-w-0 items-center gap-2 text-left'].join(' ');

const MUTE_BUTTON_CLASS = [
  'inline-flex h-7 w-7 items-center justify-center rounded-[8px]',
  'hover:bg-[var(--sniptale-color-surface-hover)] disabled:opacity-40',
].join(' ');

const STATUS_PILL_CLASS = [
  'shrink-0 rounded-full border border-[var(--sniptale-color-border-soft)]',
  'px-2 py-0.5 text-[10px] font-semibold',
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
    <section className={LIVE_PANEL_CLASS}>
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
          <div className="text-[11px] font-semibold text-[var(--sniptale-color-accent)]">
            {translate('popup.video.cameraWindowTitle')}
          </div>
          <div className="mt-0.5 truncate text-[10px] text-[var(--sniptale-color-text-muted-strong)]">
            {props.state.status === VideoRecordingStatus.PREPARING
              ? translate('popup.video.cameraWindowPreparing')
              : translate('popup.video.modeCameraHint')}
          </div>
        </div>
        <div className={STATUS_PILL_CLASS}>{getRecordingStatusLabel(props.state.status)}</div>
      </div>

      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <CameraNameBlock webcamLabel={props.media.webcamLabel} />
        <MicrophoneBlock
          capability={props.capability}
          media={props.media}
          onControl={props.onControl}
        />
        <div className="text-2xl font-bold leading-none tabular-nums text-[var(--sniptale-color-danger)] md:text-right">
          {formatDuration(props.state.duration)}
        </div>
      </div>

      {props.error ? (
        <div className="text-[11px] text-[var(--sniptale-color-danger)]">{props.error}</div>
      ) : null}
    </div>
  );
}

function CameraNameBlock({ webcamLabel }: { webcamLabel: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.activeWebcamLabel')}
      </div>
      <div className="mt-0.5 max-w-[680px] truncate text-[13px] font-semibold" title={webcamLabel}>
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
  return (
    <div className={MICROPHONE_PANEL_CLASS}>
      <Mic className="h-3.5 w-3.5 shrink-0 text-[var(--sniptale-color-text-muted-strong)]" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-[var(--sniptale-color-text-muted-strong)]">
          {translate('popup.video.activeMicrophoneLabel')}
        </div>
        <div className="truncate text-[12px] font-semibold" title={props.media.microphoneLabel}>
          {props.media.microphoneLabel}
        </div>
      </div>
      <button
        type="button"
        className={MUTE_BUTTON_CLASS}
        disabled={!capability || !props.media.microphoneSelected}
        title={resolveMuteTitle(props.media.microphoneEnabled)}
        onClick={() => {
          if (capability) {
            props.onControl(createMuteToggleMessage(capability, props.media.microphoneEnabled));
          }
        }}
      >
        <Mic className="h-3.5 w-3.5" />
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
