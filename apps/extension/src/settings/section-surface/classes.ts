import { getControlSecondaryButtonClassName } from '@sniptale/ui/control-language';

export const settingsPageLayoutClassName = [
  'mx-auto grid h-full min-h-0 w-full max-w-[1440px] flex-1 gap-3 p-3',
  'grid-cols-[240px_minmax(0,1fr)] grid-rows-1',
].join(' ');

export const settingsPageSidebarClassName = [
  'flex h-full min-h-0 flex-col overflow-hidden rounded-[4px]',
  'border border-solid border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)]',
].join(' ');

export const settingsPageContentClassName = [
  'h-full min-h-0 rounded-[4px] border border-solid',
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
].join(' ');

export const settingsSectionClassName = 'animate-fadeIn space-y-4';

// Simple forms stay narrow enough that a control remains visually connected to its label.
// Catalogs, tables, and status dashboards intentionally do not use this constraint.
export const settingsCompactWorkbenchClassName = 'w-full max-w-[720px]';

export const settingsSectionHeadingWrapClassName = [
  'flex flex-wrap items-start justify-between gap-3 border-b border-solid pb-3',
  'border-[var(--sniptale-color-border-soft)]',
].join(' ');

export const settingsSectionKickerClassName =
  'text-[14px] leading-5 font-semibold text-[var(--sniptale-color-text-primary)]';

export const settingsSectionDescriptionClassName =
  'max-w-3xl text-[13px] leading-[18px] text-[var(--sniptale-color-text-secondary)]';

export const settingsPanelClassName = [
  'border-b border-solid border-[var(--sniptale-color-border-soft)] pb-4',
  'last:border-b-0 last:pb-0',
].join(' ');

export const settingsEmptyStateClassName = [
  'rounded-[4px] border border-solid px-3 py-4 text-center',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,var(--sniptale-color-surface-panel)_58%)]',
].join(' ');

export const settingsToggleRowClassName = 'flex min-h-8 items-center justify-between gap-2 py-0';

export const settingsAddButtonClassName = [
  'inline-flex w-fit',
  getControlSecondaryButtonClassName({ density: 'default' }),
].join(' ');

export const settingsNeutralBadgeClassName = [
  'rounded-[4px] px-2 py-0.5 text-xs leading-4',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-text-dim)_14%,transparent)]',
  'text-[var(--sniptale-color-text-muted)]',
].join(' ');

export const settingsSuccessBadgeClassName = [
  'rounded-[4px] px-2 py-0.5 text-xs leading-4',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-success)_12%,transparent)]',
  'text-[var(--sniptale-color-success)]',
].join(' ');

export const settingsModalFieldSurfaceClassName = '';

export const settingsModalClassName = [
  '!rounded-[8px]',
  '[&_.sniptale-modal-header-sm]:px-4 [&_.sniptale-modal-header-sm]:py-3',
  '[&_.sniptale-modal-body-sm]:px-4 [&_.sniptale-modal-body-sm]:py-3',
  '[&_.sniptale-modal-footer-sm]:px-4 [&_.sniptale-modal-footer-sm]:py-3',
].join(' ');

export const settingsMetaLabelClassName =
  'text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]';

export const settingsDividerClassName =
  'h-px bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_64%,transparent)]';
