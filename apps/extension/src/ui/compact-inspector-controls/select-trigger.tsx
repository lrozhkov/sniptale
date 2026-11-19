import { ChevronDown } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

import { cx } from './shared';
import type { CompactSelectOption } from '@sniptale/ui/compact-inspector-controls/select-types';
import { TextWithOverflowHint } from './overflow-hint';

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

  return (
    <button
      {...triggerProps}
      ref={triggerRef}
      type="button"
      aria-controls={menuId}
      aria-expanded={open}
      aria-haspopup="listbox"
      disabled={disabled}
      className={cx(
        'flex w-full min-w-0 max-w-full items-center justify-between overflow-hidden',
        'text-[color:var(--sniptale-color-text-primary)]',
        'transition-colors',
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer',
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
        <TextWithOverflowHint className="block truncate" text={label} />
        {selectedOption?.description ? (
          <TextWithOverflowHint
            className={[
              'sniptale-compact-select-description',
              'block truncate text-[length:var(--sniptale-compact-font-size,11px)] font-medium',
              'text-[color:var(--sniptale-color-text-muted)]',
            ].join(' ')}
            text={selectedOption.description}
          />
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
