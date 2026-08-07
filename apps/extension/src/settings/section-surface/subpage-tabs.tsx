export function SettingsSubpageTabs(props: {
  activeId: string;
  ariaLabel: string;
  items: readonly { id: string; label: string }[];
  onChange?: ((id: string) => void) | undefined;
}) {
  return (
    <nav
      aria-label={props.ariaLabel}
      className={[
        'inline-flex max-w-full flex-wrap gap-1 rounded-[12px] border p-1',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-muted)]',
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
              'min-h-8 rounded-[8px] px-3 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
              active
                ? 'bg-[var(--sniptale-color-surface-panel)] text-[var(--sniptale-color-text-primary)] shadow-sm'
                : 'text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-text-primary)]',
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
