export function getGallerySelectionButtonClassName(selected: boolean, alwaysVisible = false) {
  return [
    'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border text-xs font-semibold transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-focus-ring)]',
    selected
      ? [
          'border-[var(--sniptale-color-border-accent-strong)]',
          'bg-[var(--sniptale-color-accent-soft)]',
          'text-[var(--sniptale-color-accent-emphasis)]',
        ].join(' ')
      : [
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]',
          'text-[var(--sniptale-color-text-primary)]',
          alwaysVisible
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        ].join(' '),
  ].join(' ');
}
