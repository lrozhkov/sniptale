import { Pause, Play, Square, Trash2 } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { CameraWindowButton } from './button';
import type { ControlCapability } from './types';

const CONTROL_BAR_CLASS = [
  'mt-4 grid gap-3 rounded-[18px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-3',
].join(' ');

const SECONDARY_BUTTON_CLASS = [
  'h-11 rounded-[12px] font-semibold',
  'hover:bg-[var(--sniptale-color-surface-hover)] disabled:opacity-40',
].join(' ');

const DANGER_BUTTON_CLASS = [
  'h-11 rounded-[12px] font-semibold text-[var(--sniptale-color-danger)]',
  'hover:bg-[var(--sniptale-color-danger-soft)] disabled:opacity-40',
].join(' ');

export function CameraControlBar(props: {
  capability: ControlCapability | null;
  cancelConfirmOpen: boolean;
  isPaused: boolean;
  onCancel: () => void;
  onContinue: () => void;
  onDelete: () => void;
  onPauseResume: () => void;
  onStop: () => void;
}) {
  return props.cancelConfirmOpen ? (
    <CancelConfirmBar {...props} />
  ) : (
    <ActiveControlBar {...props} />
  );
}

function CancelConfirmBar(props: {
  capability: ControlCapability | null;
  onContinue: () => void;
  onDelete: () => void;
}) {
  return (
    <footer className={`${CONTROL_BAR_CLASS} grid-cols-2`}>
      <button
        className={SECONDARY_BUTTON_CLASS}
        type="button"
        disabled={!props.capability}
        onClick={props.onContinue}
      >
        {translate('popup.video.cancelContinueRecording')}
      </button>
      <button
        className={DANGER_BUTTON_CLASS}
        type="button"
        disabled={!props.capability}
        onClick={props.onDelete}
      >
        {translate('popup.video.cancelDeleteRecording')}
      </button>
    </footer>
  );
}

function ActiveControlBar(props: {
  capability: ControlCapability | null;
  isPaused: boolean;
  onCancel: () => void;
  onPauseResume: () => void;
  onStop: () => void;
}) {
  return (
    <footer className={`${CONTROL_BAR_CLASS} grid-cols-3`}>
      <CameraWindowButton
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
        icon={Square}
        label={translate('popup.video.stopButton')}
        disabled={!props.capability}
        onClick={props.onStop}
      />
      <CameraWindowButton
        icon={Trash2}
        label={translate('popup.video.cancelButton')}
        disabled={!props.capability}
        tone="danger"
        onClick={props.onCancel}
      />
    </footer>
  );
}
