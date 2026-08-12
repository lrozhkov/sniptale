import { PanelTop } from 'lucide-react';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../../ui/popup-shell/icon-state-button';

export function VideoRecordingToolbarToggle({
  settings,
  onSettingsChange,
}: {
  settings: VideoRecordingSettings;
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  const active = settings.recordingSurface?.toolbarEnabled === true;

  return (
    <PopupIconStateButton
      icon={PanelTop}
      label={translate('popup.video.recordingToolbarLabel')}
      description={translate('popup.video.recordingToolbarDescription')}
      active={active}
      onClick={() =>
        onSettingsChange({
          recordingSurface: {
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
