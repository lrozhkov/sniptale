import type { ComponentType } from 'react';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const BUTTON_BASE_CLASS_NAME = [
  'group relative h-[58px] min-h-[58px] min-w-0 basis-0 overflow-hidden',
  'rounded-[12px] border',
].join(' ');
const BUTTON_ACTIVE_CLASS_NAME = [
  'grow-[1.9] border-[var(--sniptale-color-border-accent-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_26%,transparent)]',
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
const COMPACT_LAYER_BASE_CLASS_NAME = [
  'pointer-events-none absolute inset-0 text-center transition-transform duration-200 ease-out',
  'group-hover:-translate-y-px group-focus-visible:-translate-y-px group-disabled:translate-y-0',
].join(' ');
const EXPANDED_LAYER_BASE_CLASS_NAME = [
  'pointer-events-none absolute inset-y-0 left-2.5 flex w-[148px] items-center gap-2 text-left',
  'transition-transform duration-200 ease-out motion-reduce:transition-none',
  'group-hover:-translate-y-px group-focus-visible:-translate-y-px group-disabled:translate-y-0',
].join(' ');

interface PopupExpandingModeButtonProps {
  accentClassName: string;
  active: boolean;
  animate?: boolean;
  description: string;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick(): void;
}

function getButtonClassName(active: boolean, animate: boolean, disabled: boolean): string {
  return cx(
    BUTTON_BASE_CLASS_NAME,
    animate && BUTTON_ANIMATION_CLASS_NAME,
    active ? BUTTON_ACTIVE_CLASS_NAME : BUTTON_INACTIVE_CLASS_NAME,
    disabled && 'cursor-not-allowed opacity-40'
  );
}

function getCompactLayerClassName(active: boolean, animate: boolean): string {
  return cx(
    COMPACT_LAYER_BASE_CLASS_NAME,
    animate && 'transition-[opacity,transform] ease-out motion-reduce:transition-none',
    animate && (active ? 'duration-75' : 'duration-150'),
    active ? 'opacity-0' : 'opacity-100',
    animate && (active ? 'delay-0' : 'delay-200 motion-reduce:delay-0')
  );
}

function getExpandedLayerClassName(active: boolean, animate: boolean): string {
  return cx(
    EXPANDED_LAYER_BASE_CLASS_NAME,
    animate && 'transition-[opacity,transform] ease-out motion-reduce:transition-none',
    animate && (active ? 'duration-150' : 'duration-75'),
    active ? 'opacity-100' : 'opacity-0',
    animate && (active ? 'delay-200 motion-reduce:delay-0' : 'delay-0')
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
  onClick,
}: PopupExpandingModeButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={getButtonClassName(active, animate, disabled)}
      disabled={disabled}
      onClick={onClick}
      title={`${label}. ${description}`}
    >
      <span aria-hidden="true" className={getCompactLayerClassName(active, animate)}>
        <Icon className="absolute top-[7px] left-1/2 h-[19px] w-[19px] -translate-x-1/2" />
        <span className="absolute inset-x-1 bottom-[8px] block truncate text-[9px] font-medium leading-tight">
          {label}
        </span>
      </span>

      <span aria-hidden="true" className={getExpandedLayerClassName(active, animate)}>
        <Icon
          className={cx(
            'h-[19px] w-[19px] shrink-0',
            active && !disabled ? accentClassName : 'text-current'
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold leading-tight">{label}</span>
          <span className="mt-0.5 line-clamp-2 block text-[8px] leading-[1.25] text-[var(--sniptale-color-text-muted)]">
            {description}
          </span>
        </span>
      </span>
    </button>
  );
}
