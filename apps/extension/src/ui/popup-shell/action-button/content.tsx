import type { ComponentType, ReactNode } from 'react';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const POPUP_ACTION_BUTTON_SUBTITLE_CLASS_NAME = [
  'mt-0.5 block text-[11px] font-normal',
  'text-[color:color-mix(in_srgb,var(--sniptale-color-text-secondary)_78%,transparent)]',
].join(' ');

interface PopupActionButtonIconProps {
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  disabled: boolean;
}

export function PopupActionButtonIcon({
  icon: Icon,
  iconClassName,
  disabled,
}: PopupActionButtonIconProps) {
  return (
    <span
      className={[
        'inline-flex h-4 w-4 shrink-0 items-center justify-center',
        'transition-transform duration-100 group-[:enabled:active]:translate-y-px',
        'motion-reduce:group-[:enabled:active]:translate-y-0 motion-reduce:transition-none',
      ].join(' ')}
    >
      <Icon
        className={cx(
          'h-4 w-4 stroke-[1.75] transition-[color,stroke-width] duration-150',
          'group-[:enabled:hover]:stroke-2 group-[:enabled:focus-visible]:stroke-2',
          disabled ? 'text-[var(--sniptale-color-text-dim)]' : iconClassName
        )}
      />
    </span>
  );
}

export function PopupActionButtonCompactContent({
  accessibleLabel,
  trailing,
}: {
  accessibleLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <>
      {trailing ? (
        <span className="absolute right-2.5 top-1/2 shrink-0 -translate-y-1/2">{trailing}</span>
      ) : null}
      {accessibleLabel ? <span className="sr-only">{accessibleLabel}</span> : null}
    </>
  );
}

export function PopupActionButtonDefaultContent({
  label,
  subtitle,
  trailing,
}: {
  label: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <>
      <span className={['min-w-0 text-left'].join(' ')}>
        <span className="block whitespace-normal leading-[1.05]">{label}</span>
        {subtitle ? (
          <span className={POPUP_ACTION_BUTTON_SUBTITLE_CLASS_NAME}>{subtitle}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );
}
