import type { MouseEventHandler, ReactNode } from 'react';

export function PreviewFloatingControl(props: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-[8px]
        border-0 bg-transparent text-[var(--sniptale-color-text-muted-strong)] transition
        hover:bg-[var(--sniptale-color-surface-hover)]
        hover:text-[var(--sniptale-color-text-primary)]
        active:bg-[var(--sniptale-color-surface-hover)]
        aria-pressed:bg-[var(--sniptale-color-surface-hover)]
        aria-pressed:text-[var(--sniptale-color-text-primary)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]
        disabled:cursor-not-allowed disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}
