import {
  openGallery,
  openGithubRepository,
  openImageEditor,
  openScenarioEditor,
  openSettings,
  openVideoEditor,
} from '../navigation/actions';
import PopupFooter from '../footer';

export function FooterLayer() {
  return (
    <PopupFooter
      onOpenGallery={openGallery}
      onOpenGithub={openGithubRepository}
      onOpenImageEditor={openImageEditor}
      onOpenScenarioEditor={openScenarioEditor}
      onOpenSettings={openSettings}
      onOpenVideoEditor={openVideoEditor}
      showRestrictionIndicator={false}
      restrictionIndicatorTitle={null}
    />
  );
}
