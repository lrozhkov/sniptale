import { ChevronDown } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

import { cx } from './shared';
import type { CompactSelectOption } from '@sniptale/ui/compact-inspector-controls/select-types';

interface CompactSelectTriggerProps<T extends string> extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  menuId: string;
  open: boolean;
  placeholder?: string | undefined;
  selectedOption?: CompactSelectOption<T> | undefined;
  triggerRef: Ref<HTMLButtonElement>;
}

export function CompactSelectTrigger<T extends string>({
  className,
  disabled,
  menuId,
  open,
  placeholder,
  selectedOption,
  triggerRef,
  ...triggerProps
}: CompactSelectTriggerProps<T>): ReactNode {
  const selectedLabel = selectedOption?.label ?? placeholder ?? '';
  const triggerTitle = triggerProps.title ?? selectedLabel;

  return (
    <button
      {...triggerProps}
      title={triggerTitle}
      ref={triggerRef}
      type="button"
      aria-controls={menuId}
      aria-expanded={open}
      aria-haspopup="listbox"
      disabled={disabled}
      className={cx(
        'flex h-9 w-full items-center justify-between gap-2 rounded-[8px] border px-3',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_62%,transparent)]',
        'text-left text-[12px] font-semibold text-[color:var(--sniptale-color-text-primary)]',
        'transition hover:border-[color:var(--sniptale-color-border-strong)]',
        'focus-visible:outline-none focus-visible:border-[color:var(--sniptale-color-border-accent-strong)]',
        open && 'border-[color:var(--sniptale-color-border-accent-strong)]',
        disabled && 'cursor-not-allowed opacity-55',
        className
      )}
    >
      <CompactSelectTriggerContent label={selectedLabel} selectedOption={selectedOption} />
      <CompactSelectTriggerChevron open={open} />
    </button>
  );
}

function CompactSelectTriggerContent<T extends string>({
  label,
  selectedOption,
}: {
  label: string;
  selectedOption?: CompactSelectOption<T> | undefined;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {selectedOption?.icon ? (
        <span className="shrink-0 text-[color:var(--sniptale-color-text-muted)]">
          {selectedOption.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {selectedOption?.description ? (
          <span className="block truncate text-[11px] font-medium text-[color:var(--sniptale-color-text-muted)]">
            {selectedOption.description}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function CompactSelectTriggerChevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      size={15}
      strokeWidth={2.2}
      aria-hidden="true"
      className={cx(
        'shrink-0 text-[color:var(--sniptale-color-text-muted)] transition-transform',
        open && 'rotate-180'
      )}
    />
  );
}
