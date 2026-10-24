import { Pause, Play, Square, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, type Ref } from 'react';
import { translate } from '../../platform/i18n';
import { CameraWindowButton } from './button';
import { CameraRecordingStatus } from './recording-status';
import type { VideoRecordingRuntimeState } from '@sniptale/runtime-contracts/video/types/types';
import type { RuntimeControlMessage } from './types';
import type { ControlCapability } from './types';

const CONTROL_BAR_CLASS = [
  'mt-3 shrink-0 gap-2 rounded-[4px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-3',
].join(' ');

export function CameraControlBar(props: {
  state: VideoRecordingRuntimeState;
  onControl: (message: RuntimeControlMessage) => void;
  capability: ControlCapability | null;
  cancelConfirmOpen: boolean;
  isPaused: boolean;
  onCancel: () => void;
  onContinue: () => void;
  onDelete: () => void;
  onPauseResume: () => void;
  onStop: () => void;
}) {
  const focusTarget = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(props.cancelConfirmOpen);
  useLayoutEffect(() => {
    if (wasConfirming.current !== props.cancelConfirmOpen) {
      focusTarget.current?.focus({ preventScroll: true });
      wasConfirming.current = props.cancelConfirmOpen;
    }
  }, [props.cancelConfirmOpen]);

  return props.cancelConfirmOpen ? (
    <CancelConfirmBar {...props} focusTarget={focusTarget} />
  ) : (
    <ActiveControlBar {...props} focusTarget={focusTarget} />
  );
}

function CancelConfirmBar(props: {
  capability: ControlCapability | null;
  onContinue: () => void;
  onDelete: () => void;
  focusTarget: Ref<HTMLButtonElement>;
}) {
  return (
    <footer className={`${CONTROL_BAR_CLASS} grid grid-cols-2`}>
      <CameraWindowButton
        ref={props.focusTarget}
        label={translate('popup.video.cancelContinueRecording')}
        disabled={!props.capability}
        onClick={props.onContinue}
      />
      <CameraWindowButton
        label={translate('popup.video.cancelDeleteRecording')}
        disabled={!props.capability}
        tone="danger"
        onClick={props.onDelete}
      />
    </footer>
  );
}

function ActiveControlBar(props: {
  state: VideoRecordingRuntimeState;
  onControl: (message: RuntimeControlMessage) => void;
  focusTarget: Ref<HTMLButtonElement>;
  capability: ControlCapability | null;
  isPaused: boolean;
  onCancel: () => void;
  onPauseResume: () => void;
  onStop: () => void;
}) {
  return (
    <footer
      data-ui="camera-recorder.controls"
      className={`${CONTROL_BAR_CLASS} camera-recording-controls flex items-center`}
    >
      <CameraRecordingStatus
        capability={props.capability}
        state={props.state}
        onControl={props.onControl}
      />
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        <CameraWindowButton
          responsiveLabel
          icon={props.isPaused ? Play : Pause}
          label={
            props.isPaused
              ? translate('popup.video.resumeButton')
              : translate('popup.video.pauseButton')
          }
          disabled={!props.capability}
          onClick={props.onPauseResume}
        />
        <CameraWindowButton
          responsiveLabel
          icon={Square}
          label={translate('popup.video.stopButton')}
          disabled={!props.capability}
          onClick={props.onStop}
        />
        <CameraWindowButton
          responsiveLabel
          ref={props.focusTarget}
          icon={Trash2}
          label={translate('popup.video.cancelButton')}
          disabled={!props.capability}
          tone="danger"
          onClick={props.onCancel}
        />
      </div>
    </footer>
  );
}
