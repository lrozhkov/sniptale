import { Film } from 'lucide-react';
import { translate } from '../../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../../ui/popup-shell/icon-state-button';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';

export function VideoOpenEditorToggle({
  openEditorAfterRecording,
  onSettingsChange,
}: {
  openEditorAfterRecording: VideoRecordingSettings['openEditorAfterRecording'];
  onSettingsChange: (patch: Partial<VideoRecordingSettings>) => void;
}) {
  return (
    <PopupIconStateButton
      icon={Film}
      label={translate('popup.video.openEditorLabel')}
      description={translate('popup.video.openEditorDescription')}
      active={openEditorAfterRecording}
      onClick={() =>
        onSettingsChange({
          openEditorAfterRecording: !openEditorAfterRecording,
        })
      }
      accentClassName="text-[var(--sniptale-color-accent)]"
      geometry="square"
      inactiveDecoration="slash"
    />
  );
}
