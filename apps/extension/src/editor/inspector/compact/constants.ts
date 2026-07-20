export const COMPACT_POPOVER_SURFACE_CLASSNAME = [
  'rounded-[16px] border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_86%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_97%,transparent)] p-4',
  [
    'shadow-[0_18px_40px_-24px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_34%,transparent),',
    '0_8px_18px_-16px_color-mix(in_srgb,var(--sniptale-color-shadow-strong)_18%,transparent)]',
  ].join(''),
].join(' ');

export const COMPACT_POPOVER_TRIGGER_CLASSNAME = [
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]',
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_18%,var(--sniptale-color-surface-panel)_82%)]',
  'text-[color:var(--sniptale-color-text-primary)]',
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-text-primary-strong)_5%,transparent)]',
].join(' ');

export const COMPACT_POPOVER_CLOSE_BUTTON_CLASSNAME = [
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]',
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_18%,var(--sniptale-color-surface-panel)_82%)]',
  'text-[color:var(--sniptale-color-text-secondary)]',
  'transition shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-text-primary-strong)_5%,transparent)]',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_56%,transparent)]',
  [
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
    'hover:text-[color:var(--sniptale-color-text-primary)]',
  ].join(' '),
].join(' ');
