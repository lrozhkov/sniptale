export const progressHeaderClassName = [
  'rounded-[12px]',
  'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--sniptale-color-accent-soft)_58%,transparent),transparent_75%)]',
  'p-2.5 shadow-[inset_0_0_0_1px_var(--sniptale-color-border-soft)]',
].join(' ');

export const progressDescriptionClassName = [
  'mt-0.5 text-[11px] leading-4 text-[var(--sniptale-color-text-secondary)]',
].join(' ');

export const progressStepListClassName = [
  'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1',
].join(' ');

export const progressStepRowClassName = [
  'flex min-h-[30px] min-w-0 items-center gap-1.5 rounded-[10px] px-2 py-1',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)]',
  'transition-all duration-200',
].join(' ');

export const progressStepLabelWrapClassName = ['flex min-w-0 flex-1 items-center gap-1.5'].join(
  ' '
);

export const progressStepLabelClassName = [
  'min-w-0 shrink-0 truncate text-[12px] font-medium leading-4 text-[var(--sniptale-color-text-primary)]',
].join(' ');

export const progressStepDividerClassName = [
  'min-w-1.5 flex-1 border-b border-dashed border-[var(--sniptale-color-border-soft)] opacity-80',
].join(' ');

export const progressStepBadgeClassName = [
  'inline-flex shrink-0 items-center justify-center rounded-full px-2 py-0.5',
  'text-[9px] font-semibold transition-all duration-200',
].join(' ');

export const progressStepActiveClassName = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_76%,var(--sniptale-color-surface-panel)_24%)]',
  'text-[var(--sniptale-color-accent)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
].join(' ');

export const progressStepDoneClassName = [
  'bg-[var(--sniptale-color-success-soft)] text-[var(--sniptale-color-success)]',
].join(' ');

export const progressStepErrorClassName = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_78%,var(--sniptale-color-surface-panel)_22%)]',
  'text-[var(--sniptale-color-danger)]',
].join(' ');

export const progressStepIdleClassName = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]',
  'text-[var(--sniptale-color-text-dim)]',
].join(' ');

export const progressErrorListClassName = [
  'shrink-0',
  'rounded-[12px]',
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_28%,var(--sniptale-color-border-soft)_72%)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_78%,var(--sniptale-color-surface-panel)_22%)]',
  'px-2.5 py-2 text-[10px] leading-4 text-[var(--sniptale-color-text-primary)]',
].join(' ');

export const cancelButtonClassName = [
  'inline-flex h-9 items-center justify-center gap-2 rounded-[12px]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_60%,var(--sniptale-color-surface-panel)_40%)]',
  'text-[12px] font-semibold text-[var(--sniptale-color-text-primary)]',
  'shadow-[inset_0_0_0_1px_var(--sniptale-color-border-soft)] transition-all',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

export const exportSectionContainerClassName = [
  'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-[12px]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_38%,var(--sniptale-color-surface-panel)_62%)]',
  'p-2.5 shadow-[inset_0_0_0_1px_var(--sniptale-color-border-soft)]',
].join(' ');
