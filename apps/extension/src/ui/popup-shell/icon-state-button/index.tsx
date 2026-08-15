import type { ComponentType } from 'react';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const POPUP_ICON_STATE_BUTTON_BASE_CLASS_NAME = [
  'group flex w-full items-center justify-center px-2 outline-none transition-all focus-visible:outline-none',
].join(' ');

const POPUP_ICON_STATE_BUTTON_STACKED_CLASS_NAME = [
  [
    'min-h-[68px] rounded-[14px] border border-transparent bg-transparent',
    'flex-col justify-center gap-1.5 px-1.5 py-2 text-center transition-all',
  ].join(' '),
].join(' ');
const POPUP_ICON_STATE_BUTTON_TAB_CLASS_NAME = [
  'relative min-h-[50px] rounded-none border-none bg-transparent',
  'flex-col justify-center gap-1 px-1 py-1.5 text-center shadow-none',
].join(' ');

const POPUP_ICON_STATE_BUTTON_DISABLED_CLASS_NAME = ['cursor-not-allowed opacity-40'].join(' ');
const POPUP_ICON_STATE_BUTTON_ICON_ONLY_CLASS_NAME = [
  'h-[46px] w-full rounded-[12px] px-2.5 py-2',
  'border-none shadow-none',
].join(' ');
const POPUP_ICON_STATE_BUTTON_SQUARE_CLASS_NAME = [
  'aspect-square h-auto w-full rounded-[12px] p-2',
  'border-none shadow-none',
].join(' ');
const POPUP_ICON_STATE_BUTTON_HOVER_LIFT_CLASS_NAME = [
  'relative inline-flex h-[18px] w-[18px] items-center justify-center',
  'transition-transform duration-200 ease-out',
  'group-hover:-translate-y-px group-focus-visible:-translate-y-px',
  'group-disabled:translate-y-0 motion-reduce:transition-none',
].join(' ');

function getButtonClassName(
  active: boolean,
  disabled: boolean,
  layout: 'icon-only' | 'stacked' | 'tab',
  geometry: 'default' | 'square'
): string {
  return cx(
    POPUP_ICON_STATE_BUTTON_BASE_CLASS_NAME,
    layout === 'icon-only'
      ? getIconOnlyButtonClassName(active, geometry)
      : layout === 'tab'
        ? getTabButtonClassName(active)
        : getStackedButtonClassName(active),
    disabled && POPUP_ICON_STATE_BUTTON_DISABLED_CLASS_NAME
  );
}

function getTabButtonClassName(active: boolean): string {
  return cx(
    POPUP_ICON_STATE_BUTTON_TAB_CLASS_NAME,
    active
      ? 'text-[var(--sniptale-color-text-primary)]'
      : [
          'text-[var(--sniptale-color-text-secondary)]',
          'hover:text-[var(--sniptale-color-text-primary)]',
        ].join(' ')
  );
}

function getIconOnlyButtonClassName(active: boolean, geometry: 'default' | 'square'): string {
  const base =
    geometry === 'square'
      ? POPUP_ICON_STATE_BUTTON_SQUARE_CLASS_NAME
      : POPUP_ICON_STATE_BUTTON_ICON_ONLY_CLASS_NAME;

  return active
    ? getActiveIconOnlyButtonClassName(base, geometry)
    : getInactiveIconOnlyButtonClassName(base, geometry);
}

function getActiveIconOnlyButtonClassName(base: string, geometry: 'default' | 'square'): string {
  return [
    base,
    geometry === 'square'
      ? 'bg-transparent text-[var(--sniptale-color-accent-emphasis)]'
      : [
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_74%,transparent)]',
          'text-[var(--sniptale-color-accent-emphasis)]',
        ].join(' '),
    geometry === 'square'
      ? 'hover:bg-transparent'
      : 'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_88%,transparent)]',
  ].join(' ');
}

function getInactiveIconOnlyButtonClassName(base: string, geometry: 'default' | 'square'): string {
  return [
    base,
    'bg-transparent text-[var(--sniptale-color-text-secondary)]',
    geometry === 'square'
      ? 'hover:bg-transparent'
      : 'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_68%,transparent)]',
    'hover:text-[var(--sniptale-color-text-primary)]',
  ].join(' ');
}

function getStackedButtonClassName(active: boolean): string {
  return active
    ? [
        POPUP_ICON_STATE_BUTTON_STACKED_CLASS_NAME,
        'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_46%,var(--sniptale-color-border-soft)_54%)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_32%,transparent)]',
        'text-[var(--sniptale-color-text-primary-strong)]',
        'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_46%,transparent)]',
      ].join(' ')
    : [
        POPUP_ICON_STATE_BUTTON_STACKED_CLASS_NAME,
        'text-[var(--sniptale-color-text-secondary)]',
        'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_82%,transparent)]',
        'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
        'hover:text-[var(--sniptale-color-text-primary)]',
      ].join(' ');
}

function getIconClassName(active: boolean, disabled: boolean, accentClassName: string): string {
  if (disabled) {
    return 'text-[var(--sniptale-color-text-dim)]';
  }

  if (active) {
    return accentClassName;
  }

  return 'text-[var(--sniptale-color-text-secondary)]';
}

function InactiveSlashMarker() {
  return (
    <span
      aria-hidden="true"
      className={[
        [
          'pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[21px]',
          '-translate-x-1/2 -translate-y-1/2 rounded-full',
        ].join(' '),
        '-rotate-45 bg-[color:color-mix(in_srgb,currentColor_72%,transparent)] opacity-90',
      ].join(' ')}
    />
  );
}

function ButtonLabel({
  active,
  accentClassName,
  disabled,
  label,
  tabLayout,
}: {
  active: boolean;
  accentClassName: string;
  disabled: boolean;
  label: string;
  tabLayout: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'whitespace-nowrap text-center text-[10px] font-medium leading-[1.15]',
        getIconClassName(active, disabled, accentClassName),
        tabLayout && !active && !disabled && 'group-hover:text-[var(--sniptale-color-text-primary)]'
      )}
    >
      {label}
    </span>
  );
}

type PopupIconStateButtonProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description?: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  accentClassName: string;
  dataUi?: string;
  geometry?: 'default' | 'square';
  inactiveDecoration?: 'none' | 'slash';
  layout?: 'icon-only' | 'stacked' | 'tab';
};

export function PopupIconStateButton({
  icon: Icon,
  label,
  description,
  active,
  disabled = false,
  onClick,
  accentClassName,
  dataUi,
  geometry = 'default',
  inactiveDecoration = 'none',
  layout = 'icon-only',
}: PopupIconStateButtonProps) {
  const title = description ? `${label}. ${description}` : label;
  const shouldShowSlash = inactiveDecoration === 'slash' && !active && !disabled;
  const showsLabel = layout === 'stacked' || layout === 'tab';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={title}
      data-ui={dataUi ?? 'popup.icon-state-button'}
      className={getButtonClassName(active, disabled, layout, geometry)}
    >
      <span className={POPUP_ICON_STATE_BUTTON_HOVER_LIFT_CLASS_NAME}>
        <Icon
          className={cx(
            'h-[18px] w-[18px] shrink-0 transition-colors',
            getIconClassName(active, disabled, accentClassName),
            layout === 'tab' &&
              !active &&
              !disabled &&
              'group-hover:text-[var(--sniptale-color-text-primary)]'
          )}
        />
        {shouldShowSlash ? <InactiveSlashMarker /> : null}
      </span>
      {showsLabel ? (
        <ButtonLabel
          active={active}
          accentClassName={accentClassName}
          disabled={disabled}
          label={label}
          tabLayout={layout === 'tab'}
        />
      ) : null}
      {layout === 'tab' ? (
        <span
          aria-hidden="true"
          data-ui="popup.icon-state-button.active-marker"
          className={cx(
            'pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full',
            'bg-[var(--sniptale-color-accent)] transition-opacity',
            active ? 'opacity-100' : 'opacity-0'
          )}
        />
      ) : null}
    </button>
  );
}
