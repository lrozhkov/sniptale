import { Mic, MicOff } from 'lucide-react';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../platform/i18n';
import { CameraWindowButton } from './button';
import { formatDuration, getRecordingStatusLabel } from './format';
import type { ControlCapability, RuntimeControlMessage } from './types';

/** Presents media state and microphone control in the recording command row. */
export function CameraRecordingStatus(props: {
  capability: ControlCapability | null;
  state: VideoRecordingRuntimeState;
  onControl: (message: RuntimeControlMessage) => void;
}) {
  const enabled = props.state.liveMedia?.microphoneEnabled === true;
  const label = translate(
    enabled ? 'popup.video.activeMicrophoneMute' : 'popup.video.activeMicrophoneUnmute'
  );
  const status = getRecordingStatusLabel(props.state.status);
  return (
    <div className="flex shrink-0 items-center gap-2">
      <CameraWindowButton
        icon={enabled ? Mic : MicOff}
        iconOnly
        pressed={enabled}
        label={label}
        disabled={!props.capability || props.state.liveMedia?.microphoneSelected !== true}
        onClick={() => {
          if (!props.capability) return;
          props.onControl({
            type: VideoMessageType.UPDATE_SETTINGS,
            controlToken: props.capability.controlToken,
            recordingId: props.capability.recordingId,
            settings: { microphoneEnabled: !enabled },
          });
        }}
      />
      <span
        role="status"
        aria-label={status}
        className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--sniptale-color-text-secondary)]"
      >
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
        <span className="recording-status-label">{status}</span>
      </span>
      <span
        role="timer"
        aria-live="off"
        className="shrink-0 text-sm tabular-nums text-[var(--sniptale-color-danger)]"
      >
        {formatDuration(props.state.duration)}
      </span>
    </div>
  );
}
