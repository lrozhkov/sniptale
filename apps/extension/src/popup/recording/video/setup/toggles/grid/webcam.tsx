import { Camera } from 'lucide-react';
import { translate } from '../../../../../../platform/i18n';
import { PopupIconStateButton } from '../../../../../../ui/popup-shell/icon-state-button';

export function VideoWebcamToggle({
  active,
  disabled = false,
  onToggleWebcam,
}: {
  active: boolean;
  disabled?: boolean;
  onToggleWebcam: () => void;
}) {
  return (
    <PopupIconStateButton
      icon={Camera}
      label={translate('popup.video.webcamToggleLabel')}
      description={translate('popup.video.webcamToggleDescription')}
      active={active}
      disabled={disabled}
      onClick={onToggleWebcam}
      accentClassName="text-[var(--sniptale-color-technical)]"
      geometry="square"
      inactiveDecoration="slash"
    />
  );
}
