import { translate } from '../../../../../platform/i18n';
import { actionFooterSurfaceClassName } from '../../../../../ui/popup-shell/action-footer/tokens';
import type { GalleryStatus } from './types';
import { PopupHomeActionButtons } from './buttons';

interface PopupHomeActionRowProps {
  screenshotDisabled: boolean;
  screenshotDisabledTitle?: string | null;
  galleryStatus: GalleryStatus | null;
  onOpenScreenshotMode: () => void;
}

export function PopupHomeActionRow({
  screenshotDisabled,
  screenshotDisabledTitle,
  galleryStatus,
  onOpenScreenshotMode,
}: PopupHomeActionRowProps) {
  const galleryTitle = galleryStatus
    ? `${translate('popup.home.galleryTitle')}. ${galleryStatus.text}`
    : translate('popup.home.galleryTitle');

  return (
    <div className={actionFooterSurfaceClassName}>
      <PopupHomeActionButtons
        screenshotDisabled={screenshotDisabled}
        galleryTitle={galleryTitle}
        onOpenScreenshotMode={onOpenScreenshotMode}
        {...(screenshotDisabledTitle === undefined ? {} : { screenshotDisabledTitle })}
      />
    </div>
  );
}
