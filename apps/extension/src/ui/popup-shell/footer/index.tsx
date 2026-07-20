import { AlertTriangle, Blocks, Github, Paintbrush, Settings2 } from 'lucide-react';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { isDesignSystemEnabled } from '../../../platform/config/design-system-access';
import { translate } from '../../../platform/i18n';
import { PopupFooterAction } from './action';
import { PopupFooterThemeToggle } from './theme-toggle';

function getPopupFooterVersion(): string {
  try {
    return runtimeInfo.getManifest().version;
  } catch {
    return '';
  }
}

export interface PopupFooterProps {
  onOpenAppliedStyles?: () => void;
  onOpenDesignSystem: () => void;
  onOpenGithub: () => void;
  onOpenSettings: () => void;
  showAppliedStylesAction?: boolean;
  restrictionIndicatorTitle?: string | null;
  showRestrictionIndicator?: boolean;
}

function PopupFooterRestrictionIndicator({
  restrictionIndicatorTitle,
}: {
  restrictionIndicatorTitle: string;
}) {
  return (
    <div
      title={restrictionIndicatorTitle}
      aria-label={restrictionIndicatorTitle}
      className={
        'inline-flex h-8 w-8 items-center justify-center rounded-full ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_26%,transparent)] ' +
        'text-[var(--sniptale-color-danger)]'
      }
      data-ui="popup.footer.restriction-indicator"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
    </div>
  );
}

function PopupFooterActions(props: PopupFooterProps) {
  return (
    <div className="ml-3 flex items-center gap-2">
      <PopupFooterThemeToggle />
      {isDesignSystemEnabled() ? (
        <PopupFooterAction
          onClick={props.onOpenDesignSystem}
          icon={Blocks}
          label={translate('popup.common.footerDesignSystem')}
          compact
          dataUi="popup.footer.design-system-button"
        />
      ) : null}
      {props.showRestrictionIndicator && props.restrictionIndicatorTitle ? (
        <PopupFooterRestrictionIndicator
          restrictionIndicatorTitle={props.restrictionIndicatorTitle}
        />
      ) : null}
      {props.showAppliedStylesAction && props.onOpenAppliedStyles ? (
        <PopupFooterAction
          onClick={props.onOpenAppliedStyles}
          icon={Paintbrush}
          label={translate('popup.common.footerAppliedStyles')}
          iconOnly
          dataUi="popup.footer.applied-styles-button"
        />
      ) : null}
      <PopupFooterAction
        onClick={props.onOpenGithub}
        icon={Github}
        label={translate('popup.common.footerGithub')}
        iconOnly
        dataUi="popup.footer.github-button"
      />
      <PopupFooterAction
        onClick={props.onOpenSettings}
        icon={Settings2}
        label={translate('popup.common.footerSettings')}
        dataUi="popup.footer.settings-button"
      />
    </div>
  );
}

export function PopupFooter({
  onOpenAppliedStyles,
  onOpenDesignSystem,
  onOpenGithub,
  onOpenSettings,
  restrictionIndicatorTitle,
  showAppliedStylesAction = false,
  showRestrictionIndicator = false,
}: PopupFooterProps) {
  const version = getPopupFooterVersion();
  const actionsProps = {
    onOpenDesignSystem,
    onOpenGithub,
    onOpenSettings,
    showAppliedStylesAction,
    showRestrictionIndicator,
    ...(onOpenAppliedStyles === undefined ? {} : { onOpenAppliedStyles }),
    ...(restrictionIndicatorTitle === undefined ? {} : { restrictionIndicatorTitle }),
  };

  return (
    <footer
      data-ui="shared.ui.popup-footer"
      className={[
        'flex h-11 items-center justify-between rounded-[16px]',
        'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
        [
          'bg-[color:color-mix(',
          'in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
          ' px-2.5 text-xs',
        ].join(''),
        'text-[var(--sniptale-color-text-muted-strong)]',
      ].join(' ')}
    >
      <div className="min-w-0 truncate text-[var(--sniptale-color-text-dim)]">
        {version ? `v${version}` : null}
      </div>
      <PopupFooterActions {...actionsProps} />
    </footer>
  );
}
