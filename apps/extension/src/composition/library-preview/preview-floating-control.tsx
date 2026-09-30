import type { ReactNode } from 'react';

export function PreviewFloatingControl(props: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  pressed?: boolean;
  tabIndex?: number;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-pressed={props.pressed}
      title={props.title ?? props.ariaLabel}
      tabIndex={props.tabIndex}
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border
        border-[var(--sniptale-color-border-soft)]
        bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]
        text-[var(--sniptale-color-text-primary)] shadow-sm transition
        hover:border-[var(--sniptale-color-border-strong)]
        hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent)]
        aria-pressed:border-[var(--sniptale-color-border-strong)]
        aria-pressed:bg-[var(--sniptale-color-surface-panel)]
        aria-pressed:text-[var(--sniptale-color-accent-emphasis)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]
        disabled:cursor-not-allowed disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}
