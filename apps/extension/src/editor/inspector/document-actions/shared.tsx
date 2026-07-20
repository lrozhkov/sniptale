import { INSPECTOR_ACTION_BUTTON_BASE_CLASS_NAME } from '../chrome';
import { DANGER_PANEL_FOCUS_CLASS_NAME } from './shared.constants';

export const documentActionsSurfaceClassName = 'space-y-1.5';

const baseButtonClassName = INSPECTOR_ACTION_BUTTON_BASE_CLASS_NAME;

export const primaryPanelButtonClassName = [
  baseButtonClassName,
  'bg-transparent text-[color:var(--sniptale-color-text-primary)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_84%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_84%,transparent)]',
].join(' ');

export const secondaryPanelButtonClassName = [
  baseButtonClassName,
  'bg-transparent text-[color:var(--sniptale-color-text-primary)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_84%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_84%,transparent)]',
].join(' ');

export const neutralPanelButtonClassName = [
  baseButtonClassName,
  'bg-transparent text-[color:var(--sniptale-color-text-primary)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_84%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_84%,transparent)]',
].join(' ');

export const tertiaryPanelButtonClassName = [
  baseButtonClassName,
  'bg-transparent text-[12px] font-medium text-[color:var(--sniptale-color-text-primary)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
].join(' ');

export const dangerPanelButtonClassName = [
  baseButtonClassName,
  'bg-transparent text-[color:var(--sniptale-color-danger)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_24%,var(--sniptale-color-surface-panel)_76%)]',
  DANGER_PANEL_FOCUS_CLASS_NAME,
].join(' ');
