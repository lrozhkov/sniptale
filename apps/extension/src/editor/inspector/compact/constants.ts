export const COMPACT_POPOVER_SURFACE_CLASSNAME = [
  'sniptale-compact-workspace sniptale-image-workspace rounded-[4px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_97%,transparent)] p-3',
  [
    'shadow-[0_18px_40px_-24px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_34%,transparent),',
    '0_8px_18px_-16px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_18%,transparent)]',
  ].join(''),
].join(' ');

export const COMPACT_POPOVER_TRIGGER_CLASSNAME = [
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px]',
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_18%,var(--sniptale-color-surface-panel)_82%)]',
  'text-[color:var(--sniptale-color-text-primary)]',
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-text-primary-strong)_5%,transparent)]',
].join(' ');

export const COMPACT_POPOVER_CLOSE_BUTTON_CLASSNAME = [
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px]',
  'text-[color:var(--sniptale-color-text-secondary)] transition',
  'hover:text-[color:var(--sniptale-color-text-primary)]',
].join(' ');
