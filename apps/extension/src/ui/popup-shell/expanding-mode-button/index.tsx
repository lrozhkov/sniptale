import type { ComponentType } from 'react';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const BUTTON_BASE_CLASS_NAME = [
  'group relative h-[58px] min-h-[58px] min-w-0 basis-0 overflow-hidden',
  'rounded-[12px] border',
].join(' ');
const BUTTON_ACTIVE_CLASS_NAME = [
  'grow-[1.9] border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_46%,transparent)]',
  'text-left text-[var(--sniptale-color-text-primary)]',
].join(' ');
const BUTTON_INACTIVE_CLASS_NAME = [
  'grow border-transparent bg-transparent text-center',
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');
const BUTTON_ANIMATION_CLASS_NAME = [
  'transition-[flex-grow,background-color,border-color,color] duration-300',
  'ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
].join(' ');
const COMPACT_LAYER_BASE_CLASS_NAME = ['pointer-events-none absolute inset-0 text-center'].join(
  ' '
);
const EXPANDED_LAYER_BASE_CLASS_NAME = [
  'pointer-events-none absolute inset-y-0 left-[38px] right-2 flex min-w-0 items-center text-left',
].join(' ');
const MODE_ICON_CLASS_NAME = [
  'absolute h-[19px] w-[19px]',
  'group-hover:scale-110 group-focus-visible:scale-110',
  'group-hover:brightness-110 group-focus-visible:brightness-110',
  'group-disabled:scale-100 group-disabled:brightness-100',
].join(' ');
const MODE_ICON_ANIMATION_CLASS_NAME = [
  'transition-[left,top,translate,color,filter,scale] duration-300',
  'ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
].join(' ');

interface PopupExpandingModeButtonProps {
  accentClassName: string;
  active: boolean;
  animate?: boolean;
  description: string;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  compact?: boolean;
  onClick(): void;
}

function getButtonClassName(
  active: boolean,
  animate: boolean,
  disabled: boolean,
  compact: boolean
): string {
  return cx(
    BUTTON_BASE_CLASS_NAME,
    animate && BUTTON_ANIMATION_CLASS_NAME,
    active ? BUTTON_ACTIVE_CLASS_NAME : BUTTON_INACTIVE_CLASS_NAME,
    compact && active && 'grow-[2.2]',
    disabled && 'cursor-not-allowed opacity-40'
  );
}

function getCompactLayerClassName(active: boolean, animate: boolean): string {
  return cx(
    COMPACT_LAYER_BASE_CLASS_NAME,
    animate && 'transition-opacity duration-150 ease-out motion-reduce:transition-none',
    active ? 'opacity-0' : 'opacity-100'
  );
}

function getExpandedLayerClassName(active: boolean, animate: boolean): string {
  return cx(
    EXPANDED_LAYER_BASE_CLASS_NAME,
    animate && 'transition-opacity duration-150 ease-out motion-reduce:transition-none',
    active ? 'opacity-100' : 'opacity-0'
  );
}

export function PopupExpandingModeButton({
  accentClassName,
  active,
  animate = false,
  description,
  disabled = false,
  icon: Icon,
  label,
  compact = false,
  onClick,
}: PopupExpandingModeButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={getButtonClassName(active, animate, disabled, compact)}
      disabled={disabled}
      onClick={onClick}
      title={`${label}. ${description}`}
    >
      <Icon
        className={cx(
          MODE_ICON_CLASS_NAME,
          animate && MODE_ICON_ANIMATION_CLASS_NAME,
          active
            ? 'left-2.5 top-1/2 translate-x-0 -translate-y-1/2'
            : 'left-1/2 top-[7px] -translate-x-1/2 translate-y-0',
          active && !disabled ? accentClassName : 'text-current'
        )}
      />
      <span aria-hidden="true" className={getCompactLayerClassName(active, animate)}>
        <span className="absolute inset-x-1 bottom-[8px] block truncate text-[9px] font-medium leading-tight">
          {label}
        </span>
      </span>

      <span aria-hidden="true" className={getExpandedLayerClassName(active, animate)}>
        <span className="w-[108px] shrink-0">
          <span className="block truncate text-[11px] font-semibold leading-tight">{label}</span>
          <span className="mt-0.5 block text-[8px] leading-[1.25] text-[var(--sniptale-color-text-muted)]">
            {description}
          </span>
        </span>
      </span>
    </button>
  );
}
