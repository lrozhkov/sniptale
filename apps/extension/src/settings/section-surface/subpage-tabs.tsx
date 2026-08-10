export function SettingsSubpageTabs(props: {
  activeId: string;
  ariaLabel: string;
  items: readonly { id: string; label: string }[];
  onChange?: ((id: string) => void) | undefined;
}) {
  return (
    <nav
      aria-label={props.ariaLabel}
      data-ui="settings.subpage-tabs"
      className={[
        'sticky top-0 z-20 flex w-full max-w-full flex-wrap gap-x-6 gap-y-1',
        'bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
    >
      {props.items.map((item) => {
        const active = props.activeId === item.id;
        return (
          <button
            key={item.id}
            type="button"
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
