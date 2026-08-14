import { AlertTriangle, Film, Github, Settings2 } from 'lucide-react';
import { translate } from '../../../platform/i18n/popup';
import { PopupFooterAction } from './action';
import { ImageAdjust, ImageStack, StoryboardFlow } from './application-icons';
import { PopupFooterThemeToggle } from './theme-toggle';

export interface PopupFooterProps {
  onOpenGallery: () => void;
  onOpenImageEditor: () => void;
  onOpenScenarioEditor: () => void;
  onOpenVideoEditor: () => void;
  onOpenGithub: () => void;
  onOpenSettings: () => void;
  restrictionIndicatorTitle?: string | null;
  showRestrictionIndicator?: boolean;
}

function PopupFooterApplicationActions(props: PopupFooterProps) {
  return (
    <div className="flex shrink-0 items-center gap-1" data-ui="popup.footer.application-actions">
      <PopupFooterAction
        onClick={props.onOpenImageEditor}
        icon={ImageAdjust}
        label={translate('popup.common.footerImageEditor')}
        iconOnly
        dataUi="popup.footer.image-editor-button"
      />
      <PopupFooterAction
        onClick={props.onOpenVideoEditor}
        icon={Film}
        label={translate('popup.common.footerVideoEditor')}
        iconOnly
        dataUi="popup.footer.video-editor-button"
      />
      <PopupFooterAction
        onClick={props.onOpenScenarioEditor}
        icon={StoryboardFlow}
        label={translate('popup.common.footerScenarioEditor')}
        iconOnly
        dataUi="popup.footer.scenario-editor-button"
      />
      <PopupFooterAction
        onClick={props.onOpenGallery}
        icon={ImageStack}
        label={translate('popup.common.footerGallery')}
        iconOnly
        dataUi="popup.footer.gallery-button"
      />
    </div>
  );
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
      {props.showRestrictionIndicator && props.restrictionIndicatorTitle ? (
        <PopupFooterRestrictionIndicator
          restrictionIndicatorTitle={props.restrictionIndicatorTitle}
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
  onOpenGallery,
  onOpenImageEditor,
  onOpenScenarioEditor,
  onOpenVideoEditor,
  onOpenGithub,
  onOpenSettings,
  restrictionIndicatorTitle,
  showRestrictionIndicator = false,
}: PopupFooterProps) {
  const actionsProps = {
    onOpenGallery,
    onOpenImageEditor,
    onOpenScenarioEditor,
    onOpenVideoEditor,
    onOpenGithub,
    onOpenSettings,
    showRestrictionIndicator,
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
      <div className="flex min-w-0 items-center gap-2">
        <PopupFooterApplicationActions {...actionsProps} />
        <div
          aria-hidden="true"
          className="h-5 w-px shrink-0 bg-[var(--sniptale-color-border-soft)]"
          data-ui="popup.footer.application-separator"
        />
      </div>
      <PopupFooterActions {...actionsProps} />
    </footer>
  );
}
