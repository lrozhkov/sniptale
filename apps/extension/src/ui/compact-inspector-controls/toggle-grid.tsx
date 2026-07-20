import type React from 'react';
import { resolveCompactGridClassName } from '@sniptale/ui/compact-inspector-controls/grid';
import { cx } from './shared';

const TOGGLE_GRID_TEXT_CLASS_NAME = [
  'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
  'text-[11px] font-semibold leading-none',
].join(' ');

export function ToggleGrid(props: {
  ariaLabel: string;
  columns?: 1 | 2 | 3 | 4 | 5;
  optionClassName?: string | undefined;
  options: Array<{
    active: boolean;
    icon?: React.ReactNode | undefined;
    label: string;
    onToggle: () => void;
  }>;
}) {
  const columns = props.columns ?? 4;

  return (
    <div
      data-ui="shared.ui.compact-inspector.toggle-grid"
      role="group"
      aria-label={props.ariaLabel}
      className={cx('grid gap-1.5', resolveCompactGridClassName(columns))}
    >
      {props.options.map((option) => (
        <ToggleGridOption key={option.label} option={option} className={props.optionClassName} />
      ))}
    </div>
  );
}

function ToggleGridOption({
  className,
  option,
}: {
  className?: string | undefined;
  option: {
    active: boolean;
    icon?: React.ReactNode | undefined;
    label: string;
    onToggle: () => void;
  };
}) {
  return (
    <button
      type="button"
      aria-label={option.label}
      aria-pressed={option.active}
      title={option.label}
      onClick={option.onToggle}
      className={cx(
        'flex h-10 min-w-0 items-center justify-center rounded-[9px] border px-2 transition',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        'text-[color:var(--sniptale-color-text-secondary)]',
        'hover:border-[color:var(--sniptale-color-border-strong)]',
        option.active &&
          [
            'border-[color:var(--sniptale-color-border-accent-strong)]',
            'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
            'text-[color:var(--sniptale-color-text-primary)]',
          ].join(' '),
        className
      )}
    >
      {option.icon ? <ToggleGridIcon>{option.icon}</ToggleGridIcon> : null}
      {option.icon ? null : <span className={TOGGLE_GRID_TEXT_CLASS_NAME}>{option.label}</span>}
    </button>
  );
}

function ToggleGridIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center [&_svg]:!h-[17px] [&_svg]:!w-[17px]"
    >
      {children}
    </span>
  );
}
