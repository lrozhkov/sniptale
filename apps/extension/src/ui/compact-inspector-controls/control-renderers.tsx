import type React from 'react';
import { Check } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { resolveCompactGridClassName } from '@sniptale/ui/compact-inspector-controls/grid';
import { cx } from './shared';

export function CompactSegmentedSelector<T extends string>(props: {
  ariaLabel: string;
  columns: 1 | 2 | 3 | 4 | 5;
  options: Array<{ disabled?: boolean; icon?: React.ReactNode; label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      data-ui="shared.ui.compact-inspector.segmented-row"
      aria-label={props.ariaLabel}
      className={cx('grid min-w-0 flex-1 gap-1.5', resolveCompactGridClassName(props.columns))}
    >
      {props.options.map((option) => (
        <SegmentedOption
          key={option.value}
          active={option.value === props.value}
          onChange={props.onChange}
          option={option}
        />
      ))}
    </div>
  );
}

function SegmentedOption<T extends string>(props: {
  active: boolean;
  option: { disabled?: boolean; icon?: React.ReactNode; label: string; value: T };
  onChange: (value: T) => void;
}) {
  return (
    <ProductActionButton
      compact
      tone="toggle"
      active={props.active}
      className="min-w-0 !h-auto !min-h-10 !whitespace-normal !px-2 py-2 text-center !text-[11px] !leading-tight"
      aria-pressed={props.active}
      disabled={props.option.disabled === true}
      title={props.option.label}
      onClick={() => props.onChange(props.option.value)}
    >
      {props.option.icon ?? <span className="min-w-0 break-normal">{props.option.label}</span>}
    </ProductActionButton>
  );
}

export function OptionRowValue({ value }: { value?: React.ReactNode | undefined }) {
  if (!value) {
    return null;
  }

  return (
    <span className="text-[12px] font-semibold text-[color:var(--sniptale-color-text-muted)]">
      {value}
    </span>
  );
}

export function OptionToggleIndicator({ active }: { active: boolean }) {
  return (
    <span
      data-state={active ? 'active' : 'inactive'}
      className={cx(
        'flex h-4 w-7 items-center rounded-full border p-[2px] transition',
        active
          ? [
              'justify-end border-[color:var(--sniptale-color-border-accent-strong)]',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
            ].join(' ')
          : [
              'justify-start border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_72%,transparent)]',
            ].join(' ')
      )}
      aria-hidden="true"
    >
      <span
        className={cx(
          'flex h-3 w-3 items-center justify-center rounded-full transition',
          active
            ? 'bg-[color:var(--sniptale-color-accent)] text-[color:var(--sniptale-color-surface-panel)]'
            : 'bg-[color:var(--sniptale-color-text-muted)] opacity-55'
        )}
      >
        {active ? <Check size={9} strokeWidth={3} /> : null}
      </span>
    </span>
  );
}
