import type { ComponentType } from 'react';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const POPUP_FOOTER_ACTION_BASE_CLASS_NAME = [
  'inline-flex items-center justify-center gap-2 border-none transition-colors',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sniptale-color-accent)]',
  'bg-transparent',
  'text-[var(--sniptale-color-text-secondary)]',
  'shadow-none',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

function getPopupFooterActionClassName(iconOnlyMode: boolean) {
  return cx(
    POPUP_FOOTER_ACTION_BASE_CLASS_NAME,
    iconOnlyMode ? 'h-8 w-8 rounded-full px-0' : 'h-8 rounded-full px-3 text-[12px] font-medium'
  );
}

interface PopupFooterActionProps {
  onClick: () => void;
  icon: ComponentType<{ className?: string }>;
  label: string;
  compact?: boolean;
  iconOnly?: boolean;
  title?: string;
  dataUi?: string;
}

export function PopupFooterAction({
  onClick,
  icon: Icon,
  label,
  compact = false,
  iconOnly = false,
  title,
  dataUi,
}: PopupFooterActionProps) {
  const iconOnlyMode = compact || iconOnly;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      data-ui={dataUi ?? 'shared.ui.popup-footer-action'}
      className={getPopupFooterActionClassName(iconOnlyMode)}
    >
      <Icon className="h-3.5 w-3.5 text-current" />
      {!iconOnlyMode ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </button>
  );
}
