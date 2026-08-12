import { PanelTop } from 'lucide-react';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../../ui/popup-shell/icon-state-button';

export function VideoRecordingToolbarToggle({
  settings,
  disabled = false,
  onSettingsChange,
}: {
  settings: VideoRecordingSettings;
  disabled?: boolean;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  const active = settings.recordingSurface?.toolbarEnabled === true;

  return (
    <PopupIconStateButton
      icon={PanelTop}
      label={translate('popup.video.recordingToolbarLabel')}
      description={translate(
        disabled
          ? 'popup.video.recordingToolbarDisabledDescription'
          : 'popup.video.recordingToolbarDescription'
      )}
      active={active}
      disabled={disabled}
      onClick={() =>
        onSettingsChange({
          recordingSurface: {
            ...settings.recordingSurface,
            cursorSpotlightEnabled: settings.recordingSurface?.cursorSpotlightEnabled ?? false,
            toolbarEnabled: !active,
          },
        })
      }
      accentClassName="text-[var(--sniptale-color-accent)]"
      dataUi="popup.video.recording-toolbar-toggle"
      geometry="square"
      inactiveDecoration="slash"
    />
  );
}
