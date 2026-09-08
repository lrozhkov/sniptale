export const AREA_OUTLINE_CLASS_NAME = [
  'pointer-events-auto absolute border-2',
  'border-[color:var(--sniptale-color-accent-emphasis)] bg-[color:color-mix(',
  'in_srgb,var(--sniptale-color-accent-emphasis)_10%,transparent)]',
  'shadow-[0_0_0_1px_var(--sniptale-color-surface-panel)]',
].join(' ');

export const AREA_HANDLE_CLASS_NAME = [
  'pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2',
  'border-[color:var(--sniptale-color-text-primary-strong)] bg-[var(--sniptale-color-accent-emphasis)]',
  'shadow-[0_0_0_3px_var(--sniptale-color-surface-panel)]',
].join(' ');

export const AREA_CENTER_CLASS_NAME = [
  'pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2',
  'border-[color:var(--sniptale-color-surface-panel)] bg-[var(--sniptale-color-accent-emphasis)]',
  'shadow-[0_0_0_1px_var(--sniptale-color-accent-emphasis)]',
].join(' ');

export const AREA_HINT_CLASS_NAME = [
  'pointer-events-none absolute left-3 top-3 rounded-[10px] px-3 py-2 text-xs font-medium',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]',
  'text-[var(--sniptale-color-text-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.18)]',
].join(' ');
