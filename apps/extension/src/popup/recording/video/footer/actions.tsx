import { Circle } from 'lucide-react';
import { translate } from '../../../../platform/i18n/popup';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import { actionFooterSurfaceClassName } from '../../../../ui/popup-shell/action-footer/tokens';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoActiveFooterControls } from './active-controls';

const START_RECORDING_ICON_CLASS_NAME = 'fill-current text-[var(--sniptale-color-danger)]';

function VideoSetupStartButton({
  canStart,
  startButtonLabel,
  startDisabledReason,
  onStart,
}: {
  canStart: boolean;
  startButtonLabel: string;
  startDisabledReason: string | null;
  onStart: () => void;
}) {
  return (
    <PopupActionButton
      icon={Circle}
      label={startButtonLabel}
      iconClassName={START_RECORDING_ICON_CLASS_NAME}
      tone="primary"
      centered
      dataUi="popup.video-setup.start-recording-button"
      disabled={!canStart}
      title={startDisabledReason ?? translate('popup.video.startTitle')}
      onClick={onStart}
    />
  );
}

export function VideoSetupFooter({
  canStart,
  startButtonLabel,
  startDisabledReason,
  onStart,
  onCancel,
  onPauseResume,
  onStop,
  recordingState,
}: {
  activeRecordingId?: string | null;
  canStart: boolean;
  startButtonLabel: string;
  startDisabledReason: string | null;
  onStart: () => void;
  onCancel: () => void;
  onPauseResume: () => void;
  onStop: () => void;
  recordingState: VideoRecordingRuntimeState;
}) {
  if (recordingState.status !== VideoRecordingStatus.IDLE) {
    return (
      <VideoActiveFooterControls
        recordingState={recordingState}
        onPauseResume={onPauseResume}
        onStop={onStop}
        onCancel={onCancel}
      />
    );
  }

  return (
    <IdleVideoSetupFooter
      canStart={canStart}
      startButtonLabel={startButtonLabel}
      startDisabledReason={startDisabledReason}
      onStart={onStart}
    />
  );
}

function IdleVideoSetupFooter({
  canStart,
  startButtonLabel,
  startDisabledReason,
  onStart,
}: {
  canStart: boolean;
  startButtonLabel: string;
  startDisabledReason: string | null;
  onStart: () => void;
}) {
  return (
    <div className={actionFooterSurfaceClassName}>
      <div className="grid grid-cols-1">
        <VideoSetupStartButton
          canStart={canStart}
          startButtonLabel={startButtonLabel}
          startDisabledReason={startDisabledReason}
          onStart={onStart}
        />
      </div>
    </div>
  );
}
