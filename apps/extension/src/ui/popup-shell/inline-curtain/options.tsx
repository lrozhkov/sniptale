import { useId, useState } from 'react';
import type { ComponentType } from 'react';

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
const INLINE_CURTAIN_DETAIL_CLASS_NAME = [
  'mx-1.5 mt-1.5 rounded-[7px] px-2 py-1.5 text-[10px] leading-3',
  'bg-[var(--sniptale-color-surface-hover)] text-[var(--sniptale-color-text-secondary)]',
].join(' ');

export type InlineCurtainOption = {
  value: string;
  label: string;
  description?: string;
  detail?: string;
  disabled?: boolean;
  group?: string;
  groupDescription?: string;
  meta?: string;
  icon?: ComponentType<{ className?: string }>;
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
  activeValue,
  emptyText,
  onChange,
  options,
}: {
  activeValue: string;
  emptyText?: string;
  onChange: (value: string) => void;
  options: InlineCurtainOption[];
}) {
  const detailId = useId();
  const [highlightedDetail, setHighlightedDetail] = useState<string | null>(null);
  if (options.length === 0) {
    return (
      <div className="px-2 py-1.5 text-xs text-[var(--sniptale-color-text-secondary)]">
        {emptyText}
      </div>
    );
  }

  const visibleDetail =
    highlightedDetail ?? options.find((option) => option.disabled && option.detail)?.detail ?? null;

  return (
    <div>
      {visibleDetail ? (
        <div id={detailId} role="status" className={INLINE_CURTAIN_DETAIL_CLASS_NAME}>
          {visibleDetail}
        </div>
      ) : null}
      {options.map((option, index) => (
        <div key={option.value}>
          {option.group && options[index - 1]?.group !== option.group ? (
            <div className="px-1.5 pt-2 pb-1">
              <div className="text-[10px] font-semibold text-[var(--sniptale-color-text-muted)]">
                {option.group}
              </div>
              {option.groupDescription ? (
                <div className="mt-0.5 text-[10px] leading-3 text-[var(--sniptale-color-text-dim)]">
                  {option.groupDescription}
                </div>
              ) : null}
            </div>
          ) : null}
          <InlineCurtainOptionButton
            active={option.value === activeValue}
            onClick={() => onChange(option.value)}
            detailId={detailId}
            onHighlight={() => setHighlightedDetail(option.detail ?? null)}
            option={option}
          />
        </div>
      ))}
    </div>
  );
}

function InlineCurtainOptionButton({
  active,
  detailId,
  onClick,
  onHighlight,
  option,
}: {
  active: boolean;
  detailId: string;
  onClick: () => void;
  onHighlight: () => void;
  option: InlineCurtainOption;
}) {
  const Icon = option.icon;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      aria-describedby={option.detail ? detailId : undefined}
      aria-disabled={option.disabled || undefined}
      className={cx(
        INLINE_CURTAIN_OPTION_CLASS_NAME,
        active && INLINE_CURTAIN_OPTION_ACTIVE_CLASS_NAME,
        option.disabled && 'cursor-not-allowed opacity-55'
      )}
      onClick={() => {
        if (!option.disabled) onClick();
      }}
      onFocus={onHighlight}
      onMouseEnter={onHighlight}
      aria-current={active ? 'true' : undefined}
    >
      <span className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
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
      </span>
      {option.meta ? (
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--sniptale-color-text-muted)]">
          {option.meta}
        </span>
      ) : null}
    </button>
  );
}
