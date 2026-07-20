import {
  getControlIconButtonClassName,
  getControlSecondaryButtonClassName,
  getFormActionRowClassName,
  getFormPanelSurfaceClassName,
} from '@sniptale/ui/control-language';

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
  'rounded-[24px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_38%,transparent)]',
].join(' ');

export const settingsPageContentClassName = [
  'h-full min-h-0 rounded-[28px] border border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,var(--sniptale-color-surface-canvas)_8%)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_30%,transparent)]',
].join(' ');

export const settingsSectionClassName = 'animate-fadeIn space-y-8';

export const settingsSectionHeadingWrapClassName =
  'flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sniptale-color-border-soft)] pb-5';

export const settingsSectionKickerClassName =
  'text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]';

export const settingsSectionTitleClassName =
  'text-[28px] font-semibold tracking-[-0.03em] text-[var(--sniptale-color-text-primary-strong)]';

export const settingsSectionDescriptionClassName =
  'max-w-3xl text-sm leading-6 text-[var(--sniptale-color-text-secondary)]';

export const settingsPanelClassName = getFormPanelSurfaceClassName();

export const settingsEmptyStateClassName = [
  'rounded-[18px] border px-4 py-8 text-center',
  'border-[var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_42%,var(--sniptale-color-surface-panel)_58%)]',
].join(' ');

export const settingsListRowClassName = [
  getFormPanelSurfaceClassName({ compact: true }),
  'group relative flex items-center gap-3 p-3 transition-colors',
  'hover:border-[var(--sniptale-color-border-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
].join(' ');

export const settingsToggleRowClassName = getFormActionRowClassName({ emphasis: 'primary' });

export const settingsAddButtonClassName = [
  'flex w-full',
  getControlSecondaryButtonClassName({ density: 'default' }),
].join(' ');

export const settingsInfoIconButtonClassName = [
  getControlIconButtonClassName({ density: 'compact', tone: 'info' }),
  'disabled:cursor-not-allowed disabled:opacity-30',
  'h-10 w-10',
].join(' ');

export const settingsDangerIconButtonClassName = [
  getControlIconButtonClassName({ density: 'compact', tone: 'danger' }),
  'disabled:cursor-not-allowed disabled:opacity-30',
  'h-10 w-10',
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

export const settingsModalFieldSurfaceClassName = 'sniptale-modal-field-surface';

export const settingsMetaLabelClassName =
  'text-[11px] font-semibold tracking-[0.08em] text-[var(--sniptale-color-text-muted)]';

export const settingsDividerClassName =
  'h-px bg-[color:color-mix(in_srgb,var(--sniptale-color-border-subtle)_64%,transparent)]';
