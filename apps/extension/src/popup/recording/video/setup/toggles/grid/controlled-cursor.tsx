import { Activity } from 'lucide-react';
import { translate } from '../../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../../ui/popup-shell/icon-state-button';
import type {
  CaptureMode,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { getControlledCursorDescription } from '../../../copy';

export function VideoControlledCursorToggle({
  captureMode,
  controlledCursorCaptureEnabled,
  disabled = false,
  disabledReason,
  onSettingsChange,
}: {
  captureMode: CaptureMode;
  controlledCursorCaptureEnabled: VideoRecordingSettings['controlledCursorCaptureEnabled'];
  disabled?: boolean;
  disabledReason?: string | null;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  return (
    <PopupIconStateButton
      icon={Activity}
      label={translate('popup.video.controlledCursorLabel')}
      description={disabledReason ?? getControlledCursorDescription(captureMode)}
      active={controlledCursorCaptureEnabled === true && !disabled}
      disabled={disabled}
      onClick={() =>
        onSettingsChange({
          controlledCursorCaptureEnabled: controlledCursorCaptureEnabled !== true,
        })
      }
      accentClassName="text-[var(--sniptale-color-accent)]"
      geometry="square"
      inactiveDecoration="slash"
    />
  );
}
