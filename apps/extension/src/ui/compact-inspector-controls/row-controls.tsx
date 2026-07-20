import type React from 'react';
import { Search } from 'lucide-react';
import { OptionRowValue, OptionToggleIndicator } from './control-renderers';
import { cx } from './shared';

function getNodeTitle(value: React.ReactNode): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function OptionRow(props: {
  active?: boolean | undefined;
  disabled?: boolean | undefined;
  label: React.ReactNode;
  value?: React.ReactNode | undefined;
  onToggle?: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      data-ui="shared.ui.compact-inspector.option-row"
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onToggle}
      className={cx(
        'flex min-h-10 w-full items-center justify-between gap-3 rounded-[10px] border px-3',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        'text-left transition hover:border-[color:var(--sniptale-color-border-strong)]',
        props.disabled && 'cursor-not-allowed opacity-55'
      )}
    >
      <span
        className="min-w-0 text-[12px] font-semibold text-[color:var(--sniptale-color-text-secondary)]"
        title={getNodeTitle(props.label)}
      >
        {props.label}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <OptionRowValue value={props.value} />
        <OptionToggleIndicator active={props.active === true} />
      </span>
    </button>
  );
}

export function StatusRow(props: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div
      data-ui="shared.ui.compact-inspector.status-row"
      className={cx(
        'flex min-h-10 items-center justify-between gap-3 rounded-[10px] border px-3',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]'
      )}
    >
      <span
        className={[
          'min-w-0 truncate text-[12px] font-semibold',
          'text-[color:var(--sniptale-color-text-secondary)]',
        ].join(' ')}
        title={getNodeTitle(props.label)}
      >
        {props.label}
      </span>
      <span
        className={[
          'shrink-0 text-right text-[12px] font-semibold',
          'text-[color:var(--sniptale-color-text-muted)]',
        ].join(' ')}
        title={getNodeTitle(props.value)}
      >
        {props.value}
      </span>
    </div>
  );
}

export function SearchField(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={cx(
        'flex h-10 items-center gap-2 rounded-[10px] border px-3',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]'
      )}
    >
      <Search size={15} strokeWidth={2} className="text-[color:var(--sniptale-color-text-muted)]" />
      <span className="sr-only">{props.label}</span>
      <input
        aria-label={props.label}
        type="search"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        className={cx(
          'min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] font-medium',
          'text-[color:var(--sniptale-color-text-primary)] outline-none',
          'placeholder:text-[color:var(--sniptale-color-text-muted)]'
        )}
      />
    </label>
  );
}
