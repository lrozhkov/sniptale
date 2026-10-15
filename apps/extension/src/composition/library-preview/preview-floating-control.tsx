import { useContext, type MouseEventHandler, type ReactNode } from 'react';
import { CommandPressScope, useCommandPress } from '@sniptale/ui/control-language/press';

export function PreviewFloatingControl(props: {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  dismiss?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  pressed?: boolean;
  tabIndex?: number;
  title?: string;
}) {
  const scoped = useContext(CommandPressScope);
  const press = useCommandPress({
    enabled: scoped,
    disabled: props.disabled,
    onClick: props.onClick,
  });
  return (
    <button
      {...press.props}
      data-command-press={scoped ? '' : undefined}
      data-pressing={press.pressed ? 'true' : undefined}
      data-command-chrome={scoped && props.dismiss ? 'true' : undefined}
      type="button"
      aria-label={props.ariaLabel}
      aria-pressed={props.pressed}
      title={props.title ?? props.ariaLabel}
      tabIndex={props.tabIndex}
      disabled={props.disabled}
      className={`${props.dismiss ? 'sniptale-dismiss-button' : ''}
        inline-flex h-9 w-9 items-center justify-center rounded-[8px]
        border-0 bg-transparent text-[var(--sniptale-color-text-muted-strong)] transition
        hover:bg-[var(--sniptale-color-surface-hover)]
        hover:text-[var(--sniptale-color-text-primary)]
        active:bg-[var(--sniptale-color-surface-hover)]
        aria-pressed:bg-[var(--sniptale-color-surface-hover)]
        aria-pressed:text-[var(--sniptale-color-text-primary)]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]
        disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {scoped ? <span className="sniptale-command-content">{props.children}</span> : props.children}
    </button>
  );
}
