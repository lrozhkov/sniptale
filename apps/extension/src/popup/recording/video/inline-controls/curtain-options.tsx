import { type Ref, type RefObject } from 'react';

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const INLINE_CURTAIN_OPTION_CLASS_NAME = [
  'flex min-h-7 w-full min-w-0 items-center justify-between gap-2 rounded-[6px] px-1.5 py-1',
  'text-left text-[11px] text-[var(--sniptale-color-text-secondary)] transition-colors',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_56%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');
const INLINE_CURTAIN_OPTION_ACTIVE_CLASS_NAME = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_10%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
].join(' ');

export type InlineCurtainOption = {
  value: string;
  label: string;
  description?: string;
};

export function InlineCurtainNotice({ notice }: { notice?: string }) {
  if (!notice) {
    return null;
  }

  return (
    <div className="px-1.5 pb-1 text-[10px] leading-3 text-[var(--sniptale-color-text-muted)]">
      {notice}
    </div>
  );
}

export function InlineCurtainOptionList({
  activeOptionRef,
  activeValue,
  emptyText,
  firstOptionRef,
  listOffsetTop,
  listRef,
  onChange,
  options,
}: {
  activeOptionRef: RefObject<HTMLButtonElement | null>;
  activeValue: string;
  emptyText?: string;
  firstOptionRef: RefObject<HTMLButtonElement | null>;
  listOffsetTop: number;
  listRef: RefObject<HTMLDivElement | null>;
  onChange: (value: string) => void;
  options: InlineCurtainOption[];
}) {
  if (options.length === 0) {
    return (
      <div className="px-2 py-1.5 text-xs text-[var(--sniptale-color-text-secondary)]">
        {emptyText}
      </div>
    );
  }

  return (
    <div ref={listRef} style={{ paddingTop: listOffsetTop }}>
      {options.map((option) => (
        <InlineCurtainOptionButton
          key={option.value}
          active={option.value === activeValue}
          buttonRef={
            option.value === activeValue
              ? activeOptionRef
              : options[0] === option
                ? firstOptionRef
                : null
          }
          onClick={() => onChange(option.value)}
          option={option}
        />
      ))}
    </div>
  );
}

function InlineCurtainOptionButton({
  active,
  buttonRef,
  onClick,
  option,
}: {
  active: boolean;
  buttonRef: Ref<HTMLButtonElement> | null;
  onClick: () => void;
  option: InlineCurtainOption;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cx(
        INLINE_CURTAIN_OPTION_CLASS_NAME,
        active && INLINE_CURTAIN_OPTION_ACTIVE_CLASS_NAME
      )}
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
    >
      <span className="min-w-0">
        <span className="block truncate font-medium" title={option.label}>
          {option.label}
        </span>
        {option.description ? (
          <span
            className="block truncate text-[10px] text-[var(--sniptale-color-text-muted)]"
            title={option.description}
          >
            {option.description}
          </span>
        ) : null}
      </span>
    </button>
  );
}
