import { Camera, FileStack, Image, Images } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { PopupActionButton } from '../../../../../ui/popup-shell/action-button';
import { openGallery, openImageEditor, openScenarioEditor } from '../../../navigation/actions';

const screenshotPrepIconClassName = [
  'text-[var(--sniptale-color-text-primary)]',
  'group-hover:text-[var(--sniptale-color-accent-emphasis)]',
  'group-focus-visible:text-[var(--sniptale-color-accent-emphasis)]',
].join(' ');

interface PopupHomeActionButtonsProps {
  screenshotDisabled: boolean;
  screenshotDisabledTitle?: string | null;
  galleryTitle: string;
  onOpenScreenshotMode: () => void;
}

export function PopupHomeActionButtons({
  screenshotDisabled,
  screenshotDisabledTitle,
  galleryTitle,
  onOpenScreenshotMode,
}: PopupHomeActionButtonsProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_48px_48px_48px] gap-1.5">
      <PopupActionButton
        icon={Camera}
        label={translate('popup.home.screenshotPrepLabel')}
        iconClassName={screenshotPrepIconClassName}
        tone="primary"
        dataUi="popup.home.screenshot-prep-button"
        disabled={screenshotDisabled}
        title={screenshotDisabledTitle ?? translate('popup.home.screenshotPrepTitle')}
        onClick={onOpenScreenshotMode}
      />
      <PopupActionButton
        icon={Image}
        label={translate('popup.home.imageEditorLabel')}
        iconClassName="text-[var(--sniptale-color-text-secondary)]"
        compact
        dataUi="popup.home.image-editor-button"
        title={translate('popup.home.imageEditorTitle')}
        onClick={openImageEditor}
      />
      <PopupActionButton
        icon={FileStack}
        label={translate('popup.home.scenarioEditorLabel')}
        iconClassName="text-[var(--sniptale-color-text-secondary)]"
        compact
        dataUi="popup.home.scenario-editor-button"
        title={translate('popup.home.scenarioEditorTitle')}
        onClick={openScenarioEditor}
      />
      <PopupActionButton
        icon={Images}
        label={translate('popup.home.galleryLabel')}
        iconClassName="text-[var(--sniptale-color-text-secondary)]"
        tone="gallery"
        compact
        dataUi="popup.home.gallery-button"
        title={galleryTitle}
        onClick={openGallery}
      />
    </div>
  );
}
