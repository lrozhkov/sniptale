import { Circle, Library } from 'lucide-react';
import { translate } from '../../../../platform/i18n/popup';
import { openGalleryPage } from '../../../../platform/navigation/extension-pages';
import { PopupActionButton } from '../../../../ui/popup-shell/action-button';
import { actionFooterSurfaceClassName } from '../../../../ui/popup-shell/action-footer/tokens';
import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoActiveFooterControls } from './active-controls';

const ACTION_ICON_CLASS_NAME = [
  'text-[var(--sniptale-color-text-secondary)]',
  'group-hover:text-[var(--sniptale-color-text-primary)]',
  'group-focus-visible:text-[var(--sniptale-color-text-primary)]',
].join(' ');
const START_RECORDING_ICON_CLASS_NAME = 'fill-current text-[var(--sniptale-color-danger)]';

function openGallery() {
  void openGalleryPage({ folder: 'recording' });
  window.close();
}

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
  galleryTitle,
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
  galleryTitle: string;
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
      galleryTitle={galleryTitle}
    />
  );
}

function IdleVideoSetupFooter({
  canStart,
  startButtonLabel,
  startDisabledReason,
  onStart,
  galleryTitle,
}: {
  canStart: boolean;
  startButtonLabel: string;
  startDisabledReason: string | null;
  onStart: () => void;
  galleryTitle: string;
}) {
  return (
    <div className={actionFooterSurfaceClassName}>
      <div className="grid grid-cols-[minmax(0,1fr)_48px] gap-1.5">
        <VideoSetupStartButton
          canStart={canStart}
          startButtonLabel={startButtonLabel}
          startDisabledReason={startDisabledReason}
          onStart={onStart}
        />
        <PopupActionButton
          icon={Library}
          label={translate('popup.video.galleryLabel')}
          iconClassName={ACTION_ICON_CLASS_NAME}
          tone="gallery"
          compact
          dataUi="popup.video-setup.gallery-button"
          title={galleryTitle}
          onClick={openGallery}
        />
      </div>
    </div>
  );
}
