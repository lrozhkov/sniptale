import { openDesignSystem, openGithubRepository, openSettings } from '../navigation/actions';
import PopupFooter from '../footer';
import { useAppliedPageStylesEntrypoint } from './applied-styles-entrypoint';

export function FooterLayer() {
  const appliedStyles = useAppliedPageStylesEntrypoint();

  return (
    <PopupFooter
      onOpenAppliedStyles={appliedStyles.handleOpenAppliedStyles}
      onOpenDesignSystem={openDesignSystem}
      onOpenGithub={openGithubRepository}
      onOpenSettings={openSettings}
      showAppliedStylesAction={appliedStyles.showAppliedStylesAction}
      showRestrictionIndicator={false}
      restrictionIndicatorTitle={null}
    />
  );
}
