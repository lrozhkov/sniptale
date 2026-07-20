import {
  getControlPrimaryButtonClassName,
  getControlSecondaryButtonClassName,
} from '@sniptale/ui/control-language';

export const INSPECTOR_SECTION_SURFACE_CLASS_NAME =
  'space-y-2.5 rounded-[14px] bg-transparent px-0 py-0';

export const INSPECTOR_SECTION_HEADER_CLASS_NAME =
  'flex items-baseline justify-between gap-3 px-0.5';

export const INSPECTOR_SECTION_LABEL_CLASS_NAME =
  'text-[12px] font-bold uppercase text-[color:var(--sniptale-color-text-secondary)]';

export const INSPECTOR_SECTION_VALUE_CLASS_NAME =
  'text-[11px] font-medium text-[color:var(--sniptale-color-text-secondary)]';

export const INSPECTOR_INLINE_BUTTON_CLASS_NAME =
  'inline-flex h-10 items-center justify-center rounded-[12px] border-none bg-transparent px-3 ' +
  'text-[12px] font-medium text-[color:var(--sniptale-color-text-secondary)] transition ' +
  'focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)] ' +
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)] ' +
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)] ' +
  'hover:text-[color:var(--sniptale-color-text-primary)]';

export const INSPECTOR_PRIMARY_BUTTON_CLASS_NAME = [
  getControlPrimaryButtonClassName(),
  'w-full disabled:opacity-50',
].join(' ');

export const INSPECTOR_SECONDARY_BUTTON_CLASS_NAME = [
  getControlSecondaryButtonClassName(),
  'w-full text-[color:var(--sniptale-color-text-secondary)] hover:text-[color:var(--sniptale-color-text-primary)]',
].join(' ');

export const INSPECTOR_ACTION_BUTTON_BASE_CLASS_NAME =
  'inline-flex h-10 w-full items-center justify-between gap-3 rounded-[12px] border-none ' +
  'px-3.5 text-left text-[12px] font-medium leading-none transition ' +
  'focus-visible:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)] ' +
  'disabled:cursor-not-allowed disabled:opacity-55';

const INSPECTOR_STATUS_BADGE_BASE_CLASS_NAME =
  'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-transparent px-2 ' +
  'text-[10px] font-semibold uppercase';

export const INSPECTOR_STATUS_BADGE_NEUTRAL_CLASS_NAME =
  INSPECTOR_STATUS_BADGE_BASE_CLASS_NAME +
  ' bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_30%,var(--sniptale-color-surface-panel)_70%)] ' +
  'text-[color:var(--sniptale-color-text-secondary)]';

export const INSPECTOR_STATUS_BADGE_SUCCESS_CLASS_NAME =
  INSPECTOR_STATUS_BADGE_BASE_CLASS_NAME +
  ' bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_48%,var(--sniptale-color-surface-panel)_52%)] ' +
  'text-[color:var(--sniptale-color-accent-emphasis)]';
