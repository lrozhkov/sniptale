export const aiProvidersSectionCardClassName = [
  'rounded-xl border border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)]',
  'p-6',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_52%,transparent)]',
].join(' ');

export const aiProvidersAddButtonClassName = [
  'flex items-center gap-1.5 rounded-lg border bg-transparent px-3 py-1.5 text-xs font-medium',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_28%,var(--sniptale-color-border-soft)_72%)]',
  'text-[var(--sniptale-color-accent-emphasis)] transition-colors',
  'hover:border-[var(--sniptale-color-border-accent-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_54%,transparent)]',
].join(' ');

export const aiProvidersAddButtonDisabledClassName = [
  aiProvidersAddButtonClassName,
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

export const aiProvidersSavePromptButtonClassName = [
  'rounded-lg border bg-transparent px-4 py-2 text-sm font-medium',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_28%,var(--sniptale-color-border-soft)_72%)]',
  'text-[var(--sniptale-color-text-primary)] transition-all',
  'hover:border-[var(--sniptale-color-border-accent-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_54%,transparent)]',
].join(' ');
