import { Mic } from 'lucide-react';
import { translate } from '../../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../../ui/popup-shell/icon-state-button';

export function VideoMicrophoneToggle({
  active,
  onToggleMicrophone,
}: {
  active: boolean;
  onToggleMicrophone: () => void;
}) {
  return (
    <PopupIconStateButton
      icon={Mic}
      label={translate('popup.video.microphoneToggleLabel')}
      description={translate('popup.video.microphoneToggleDescription')}
      active={active}
      onClick={onToggleMicrophone}
      accentClassName="text-[var(--sniptale-color-accent)]"
      geometry="square"
      inactiveDecoration="slash"
    />
  );
}
