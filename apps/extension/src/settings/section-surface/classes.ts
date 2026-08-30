import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';

export const settingsPageLayoutClassName = [
  'mx-auto grid h-full min-h-0 w-full max-w-[1320px] flex-1 gap-6 px-5 py-5',
  'grid-rows-[minmax(0,auto)_minmax(0,1fr)]',
  'lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1 lg:px-8 lg:py-8',
].join(' ');

export const settingsPageSidebarClassName = [
  [
    'flex min-h-0 max-h-[min(38dvh,380px)] flex-col overflow-hidden',
    'lg:max-h-[calc(100dvh-64px)] lg:self-start',
  ].join(' '),
  'rounded-[24px] border border-solid border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_38%,transparent)]',
].join(' ');

export const settingsPageContentClassName = [
  'h-full min-h-0 rounded-[28px] border border-solid border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,var(--sniptale-color-surface-canvas)_8%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_30%,transparent)]',
].join(' ');

export const settingsSectionClassName = 'animate-fadeIn space-y-6';

// Simple forms stay narrow enough that a control remains visually connected to its label.
// Catalogs, tables, and status dashboards intentionally do not use this constraint.
export const settingsCompactWorkbenchClassName = 'w-full max-w-[720px]';

export const settingsSectionHeadingWrapClassName = [
  'flex flex-wrap items-start justify-between gap-4 border-b border-solid pb-5',
  'border-[var(--sniptale-color-border-soft)]',
].join(' ');

export const settingsSectionKickerClassName =
  'text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]';

export const settingsSectionDescriptionClassName =
  'max-w-3xl text-sm leading-6 text-[var(--sniptale-color-text-secondary)]';

export const settingsPanelClassName = [
  'border-b border-solid border-[var(--sniptale-color-border-soft)] pb-6',
  'last:border-b-0 last:pb-0',
].join(' ');

export const settingsEmptyStateClassName = [
  'rounded-[18px] border border-solid px-4 py-8 text-center',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,var(--sniptale-color-surface-panel)_58%)]',
].join(' ');

export const settingsToggleRowClassName = 'flex min-h-10 items-center justify-between gap-4 py-2.5';

export const settingsAddButtonClassName = [
  'flex w-full',
  getControlSecondaryButtonClassName({ density: 'default' }),
].join(' ');

export const settingsNeutralBadgeClassName = [
  'rounded-full px-2.5 py-1 text-xs',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-dim)_14%,transparent)]',
  'text-[var(--sniptale-color-text-muted)]',
].join(' ');

export const settingsSuccessBadgeClassName = [
  'rounded-full px-2.5 py-1 text-xs',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-success)_12%,transparent)]',
  'text-[var(--sniptale-color-success)]',
].join(' ');

export const settingsModalFieldSurfaceClassName = '';

export const settingsModalClassName = [
  '!rounded-[12px]',
  '[&_.sniptale-modal-header-sm]:px-5 [&_.sniptale-modal-header-sm]:py-3.5',
  '[&_.sniptale-modal-body-sm]:px-5 [&_.sniptale-modal-body-sm]:py-4',
  '[&_.sniptale-modal-footer-sm]:px-5 [&_.sniptale-modal-footer-sm]:py-3',
].join(' ');

export const settingsMetaLabelClassName =
  'text-[11px] font-semibold tracking-[0.08em] text-[var(--sniptale-color-text-muted)]';

export const settingsDividerClassName =
  'h-px bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_64%,transparent)]';
