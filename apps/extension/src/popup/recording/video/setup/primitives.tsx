import type { ComponentType, ReactNode } from 'react';
import { PopupExpandingModeButton } from '../../../../ui/popup-shell/expanding-mode-button';
function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const INLINE_SELECT_ROW_CLASS_NAME = 'mt-2 mr-1 flex items-center gap-2.5 rounded-[14px]';

export function ModeIconButton({
  icon: Icon,
  label,
  hint,
  active,
  animate,
  disabled,
  onClick,
  accentClassName,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  active: boolean;
  animate?: boolean;
  disabled?: boolean;
  onClick: () => void;
  accentClassName: string;
}) {
  return (
    <PopupExpandingModeButton
      icon={Icon}
      label={label}
      description={hint}
      active={active}
      {...(animate === undefined ? {} : { animate })}
      onClick={onClick}
      accentClassName={accentClassName}
      {...(disabled === undefined ? {} : { disabled })}
    />
  );
}

export function InlineSelectRow({
  label,
  ariaLabel,
  children,
}: {
  label: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div className={cx(INLINE_SELECT_ROW_CLASS_NAME)}>
      <span
        className="min-w-[52px] text-[11px] font-medium leading-4 text-[var(--sniptale-color-text-secondary)]"
        aria-label={ariaLabel}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
