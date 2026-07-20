import { Pause, Play, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { translate } from '../../../../platform/i18n';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import {
  actionFooterSurfaceClassName,
  actionFooterThreeColumnGridClassName,
} from '../../../../ui/popup-shell/action-footer/tokens';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { useVideoActiveViewModel } from '../active-page/view-model';

function getCanCancel(status: VideoRecordingStatus) {
  return status !== VideoRecordingStatus.IDLE && status !== VideoRecordingStatus.STOPPING;
}

function shouldConfirmCancel(status: VideoRecordingStatus) {
  return status !== VideoRecordingStatus.COUNTDOWN && status !== VideoRecordingStatus.PREPARING;
}

function PauseResumeAction(props: {
  canControl: boolean;
  isPaused: boolean;
  onPauseResume: () => void;
}) {
  return (
    <PopupActionButton
      icon={props.isPaused ? Play : Pause}
      label={
        props.isPaused
          ? translate('popup.video.resumeButton')
          : translate('popup.video.pauseButton')
      }
      iconClassName="text-[var(--sniptale-color-text-primary)]"
      tone="secondary"
      dataUi="popup.video-active.pause-resume-button"
      disabled={!props.canControl}
      title={
        props.isPaused
          ? translate('popup.video.resumeButton')
          : translate('popup.video.pauseButton')
      }
      onClick={props.onPauseResume}
    />
  );
}

function StopAction(props: { canControl: boolean; onStop: () => void }) {
  return (
    <PopupActionButton
      icon={Square}
      label={translate('popup.video.stopButton')}
      iconClassName="text-[var(--sniptale-color-text-primary)]"
      tone="primary"
      dataUi="popup.video-active.stop-button"
      disabled={!props.canControl}
      title={translate('popup.video.stopButton')}
      onClick={props.onStop}
    />
  );
}

function CancelAction(props: { canCancel: boolean; onCancel: () => void }) {
  return (
    <PopupActionButton
      icon={Trash2}
      label={translate('popup.video.cancelButton')}
      ariaLabel={translate('popup.video.cancelButton')}
      iconClassName="text-[var(--sniptale-color-danger)]"
      tone="secondary"
      compact
      dataUi="popup.video-active.cancel-button"
      disabled={!props.canCancel}
      title={translate('popup.video.cancelButton')}
      onClick={props.onCancel}
    />
  );
}

function CancelConfirmActions(props: { onCancel: () => void; onContinue: () => void }) {
  return (
    <>
      <PopupActionButton
        icon={Play}
        label={translate('popup.video.cancelContinueRecording')}
        iconClassName="text-[var(--sniptale-color-text-primary)]"
        tone="secondary"
        dataUi="popup.video-active.cancel-continue-button"
        title={translate('popup.video.cancelContinueRecording')}
        onClick={props.onContinue}
      />
      <PopupActionButton
        icon={Trash2}
        label={translate('popup.video.cancelDeleteRecording')}
        iconClassName="text-[var(--sniptale-color-danger)]"
        tone="secondary"
        dataUi="popup.video-active.cancel-delete-button"
        title={translate('popup.video.cancelDeleteRecording')}
        onClick={props.onCancel}
      />
    </>
  );
}

export function VideoActiveFooterControls(props: {
  onCancel: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  recordingState: VideoRecordingRuntimeState;
}) {
  const viewModel = useVideoActiveViewModel(props.recordingState);
  const canCancel = getCanCancel(props.recordingState.status);
  const confirmCancel = shouldConfirmCancel(props.recordingState.status);
  const cancelConfirmation = useCancelConfirmation({
    canCancel,
    canControl: viewModel.canControl,
    confirmCancel,
    isPaused: viewModel.isPaused,
    onCancel: props.onCancel,
    onPauseResume: props.onPauseResume,
  });

  if (cancelConfirmation.isConfirmingCancel) {
    return (
      <div className={actionFooterSurfaceClassName}>
        <div className="grid grid-cols-2 gap-1.5">
          <CancelConfirmActions
            onCancel={props.onCancel}
            onContinue={cancelConfirmation.handleContinue}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={actionFooterSurfaceClassName}>
      <div className={actionFooterThreeColumnGridClassName}>
        <PauseResumeAction
          canControl={viewModel.canControl}
          isPaused={viewModel.isPaused}
          onPauseResume={props.onPauseResume}
        />
        <StopAction canControl={viewModel.canControl} onStop={props.onStop} />
        <CancelAction canCancel={canCancel} onCancel={cancelConfirmation.handleCancelRequest} />
      </div>
    </div>
  );
}

function useCancelConfirmation({
  canCancel,
  canControl,
  confirmCancel,
  isPaused,
  onCancel,
  onPauseResume,
}: {
  canCancel: boolean;
  canControl: boolean;
  confirmCancel: boolean;
  isPaused: boolean;
  onCancel: () => void;
  onPauseResume: () => void;
}) {
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);

  const handleCancelRequest = () => {
    if (!canCancel) {
      return;
    }

    if (!confirmCancel) {
      onCancel();
      return;
    }

    setIsConfirmingCancel(true);
    if (canControl && !isPaused) {
      onPauseResume();
    }
  };

  const handleContinue = () => {
    setIsConfirmingCancel(false);
    if (isPaused) {
      onPauseResume();
    }
  };

  return { handleCancelRequest, handleContinue, isConfirmingCancel };
}
