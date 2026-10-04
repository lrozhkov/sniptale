import type { Ref } from 'react';

export function SettingsSubpageTabs(props: {
  activeId: string;
  ariaLabel: string;
  disabled?: boolean;
  items: readonly { id: string; label: string }[];
  navRef?: Ref<HTMLElement>;
  onChange?: ((id: string) => void) | undefined;
  placement?: 'inline' | 'sticky';
}) {
  const sticky = props.placement !== 'inline';
  return (
    <nav
      ref={props.navRef}
      aria-label={props.ariaLabel}
      data-ui="settings.subpage-tabs"
      data-sticky={sticky ? 'true' : undefined}
      className={[
        'flex flex-wrap gap-x-6 gap-y-1',
        sticky
          ? [
              'sticky z-20 border-b border-[var(--sniptale-color-border-soft)]',
              '-top-[var(--settings-scroll-inset-top,0px)]',
              '-mt-[var(--settings-scroll-inset-top,0px)]',
              'pt-[var(--settings-scroll-inset-top,0px)]',
              '-mx-[var(--settings-scroll-inset-x,0px)]',
              'px-[var(--settings-scroll-inset-x,0px)]',
            ].join(' ')
          : '',
      ].join(' ')}
      style={
        sticky
          ? {
              backgroundColor: 'var(--sniptale-color-surface-canvas)',
              backgroundImage:
                'linear-gradient(var(--sniptale-color-surface-panel), var(--sniptale-color-surface-panel))',
            }
          : undefined
      }
    >
      {props.items.map((item) => {
        const active = props.activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            disabled={props.disabled}
            aria-current={active ? 'page' : undefined}
            onClick={() => props.onChange?.(item.id)}
            className={[
              'relative min-h-11 min-w-28 px-2 py-3 text-sm font-medium',
              'transition-colors',
              'focus-visible:outline-none focus-visible:text-[var(--sniptale-color-text-primary)]',
              'focus-visible:after:absolute focus-visible:after:inset-x-0 focus-visible:after:bottom-0',
              'focus-visible:after:h-0.5 focus-visible:after:bg-[var(--sniptale-color-focus-ring)]',
              active
                ? [
                    'font-semibold text-[var(--sniptale-color-text-primary)]',
                    'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5',
                    'after:bg-[var(--sniptale-color-accent)]',
                  ].join(' ')
                : [
                    'text-[var(--sniptale-color-text-secondary)]',
                    'hover:text-[var(--sniptale-color-text-primary)]',
                  ].join(' '),
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
