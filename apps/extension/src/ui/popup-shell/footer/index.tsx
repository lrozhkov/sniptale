import type { ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { translate } from '../../../platform/i18n/popup';
import { PopupFooterAction } from './action';
import { PopupFooterThemeToggle } from './theme-toggle';
import { PopupFooterLanguageToggle } from './language-toggle';
import { GitHubIcon } from './github-icon';

export interface PopupFooterProps {
  onOpenGithub: () => void;
  onOpenSettings: () => void;
  status?: ReactNode;
}

function PopupFooterActions({ onOpenGithub }: Pick<PopupFooterProps, 'onOpenGithub'>) {
  return (
    <div className="flex items-center justify-end gap-2">
      <PopupFooterAction
        onClick={onOpenGithub}
        icon={GitHubIcon}
        label={translate('popup.common.footerGithub')}
        iconOnly
        dataUi="popup.footer.github-button"
      />
      <PopupFooterThemeToggle />
      <PopupFooterLanguageToggle />
    </div>
  );
}

export function PopupFooter({ onOpenGithub, onOpenSettings, status }: PopupFooterProps) {
  return (
    <footer
      data-ui="shared.ui.popup-footer"
      className={[
        'flex shrink-0 flex-col rounded-[6px]',
        'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
        [
          'bg-[color:color-mix(',
          'in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]',
          ' text-xs',
        ].join(''),
        'text-[var(--sniptale-color-text-muted-strong)]',
      ].join(' ')}
    >
      {status ? (
        <div className="border-b border-[var(--sniptale-color-border-soft)] px-2.5 py-1.5">
          {status}
        </div>
      ) : null}
      <div
        data-ui="popup.footer.actions"
        className="flex h-[42px] shrink-0 items-center justify-between px-2.5"
      >
        <PopupFooterAction
          onClick={onOpenSettings}
          icon={Settings2}
          label={translate('popup.common.footerSettings')}
          dataUi="popup.footer.settings-button"
        />
        <PopupFooterActions onOpenGithub={onOpenGithub} />
      </div>
    </footer>
  );
}
