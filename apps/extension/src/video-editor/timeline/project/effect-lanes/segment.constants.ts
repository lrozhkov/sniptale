export const EFFECT_SEGMENT_BASE_CLASS_NAME = [
  'group absolute inset-0 overflow-hidden rounded-[12px] border',
  'transition-[border-color,box-shadow,background-color]',
  'cursor-grab active:cursor-grabbing',
].join(' ');

export const EFFECT_SEGMENT_HANDLE_CLASS_NAME = [
  'absolute inset-y-0 z-10 w-2 rounded-full',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_28%,transparent)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_44%,transparent)]',
  'cursor-ew-resize',
].join(' ');

export const EFFECT_SEGMENT_SELECTED_CLASS_NAME = [
  'border-[color:var(--sniptale-color-border-accent-strong)]',
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-accent-strong)_55%,transparent),',
  '0_0_18px_color-mix(in_srgb,var(--sniptale-color-accent-soft)_22%,transparent)]',
].join(' ');

export const EFFECT_SEGMENT_WARNING_CLASS_NAME = [
  'border-dashed',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-warning)_62%,var(--sniptale-color-border-soft)_38%)]',
  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-warning)_32%,transparent)]',
].join(' ');

export const EFFECT_SEGMENT_CONTENT_CLASS_NAME = [
  'pointer-events-none absolute inset-x-2 top-1/2 flex h-4 -translate-y-1/2 items-center gap-1.5',
  'min-w-0 overflow-hidden text-left',
].join(' ');

export const EFFECT_SEGMENT_DEFAULT_HEIGHT = 24;
