import { openDesignSystem, openGithubRepository, openSettings } from '../navigation/actions';
import PopupFooter from '../footer';

export function FooterLayer() {
  return (
    <PopupFooter
      onOpenDesignSystem={openDesignSystem}
      onOpenGithub={openGithubRepository}
      onOpenSettings={openSettings}
      showRestrictionIndicator={false}
      restrictionIndicatorTitle={null}
    />
  );
}
