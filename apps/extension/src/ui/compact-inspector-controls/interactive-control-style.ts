import type React from 'react';

type CompactInspectorInteractiveControlStyle = React.CSSProperties & {
  '--sniptale-field-height': string;
  '--sniptale-field-padding-block': string;
  '--sniptale-field-padding-inline-start': string;
  '--sniptale-field-padding-inline-end': string;
  '--sniptale-field-gap': string;
  '--sniptale-field-radius': string;
  '--sniptale-field-font-size': string;
  '--sniptale-field-bg-idle': string;
  '--sniptale-field-border-idle': string;
  '--sniptale-field-shadow-idle': string;
  '--sniptale-field-bg-hover': string;
  '--sniptale-field-border-hover': string;
  '--sniptale-field-shadow-hover': string;
  '--sniptale-field-bg-active': string;
  '--sniptale-field-border-active': string;
  '--sniptale-field-shadow-active': string;
  '--sniptale-range-shell-height': string;
  '--sniptale-range-shell-padding-inline': string;
  '--sniptale-range-shell-radius': string;
  '--sniptale-range-shell-border-idle': string;
  '--sniptale-range-shell-bg-idle': string;
  '--sniptale-range-shell-shadow-idle': string;
  '--sniptale-range-shell-border-hover': string;
  '--sniptale-range-shell-bg-hover': string;
  '--sniptale-range-shell-shadow-hover': string;
  '--sniptale-range-shell-border-active': string;
  '--sniptale-range-shell-bg-active': string;
  '--sniptale-range-shell-shadow-active': string;
  '--sniptale-range-track-height': string;
  '--sniptale-range-thumb-size': string;
};

export const COMPACT_INSPECTOR_SOLID_CONTROL_CLASS_NAME = [
  'rounded-[10px]',
  'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_52%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_72%,var(--sniptale-color-surface-panel)_28%)]',
  'text-[var(--sniptale-color-text-primary)]',
  'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-border-subtle)_16%,transparent)]',
].join(' ');
const COMPACT_INSPECTOR_INTERACTIVE_SURFACE_MIX_VALUE = [
  'color-mix(in srgb,',
  ' var(--sniptale-color-surface-input) 78%,',
  ' var(--sniptale-color-surface-panel) 22%)',
].join('');
const COMPACT_INSPECTOR_INTERACTIVE_BORDER_VALUE = [
  'color-mix(in srgb,',
  ' var(--sniptale-color-accent) 20%,',
  ' var(--sniptale-color-border-soft) 80%)',
].join('');
const COMPACT_INSPECTOR_INTERACTIVE_HOVER_SHADOW_VALUE = [
  'inset 0 1px 0 ',
  'color-mix(in srgb, var(--sniptale-color-border-subtle) 16%, transparent)',
].join('');
const COMPACT_INSPECTOR_INTERACTIVE_ACTIVE_SHADOW_VALUE = [
  'inset 0 1px 0 ',
  'color-mix(in srgb, var(--sniptale-color-border-subtle) 16%, transparent), ',
  'inset 0 0 0 1px color-mix(in srgb, var(--sniptale-color-accent) 12%, transparent)',
].join('');

export function resolveCompactInspectorInteractiveControlStyle(
  style: React.CSSProperties | undefined
): React.CSSProperties {
  return {
    '--sniptale-field-height': '40px',
    '--sniptale-field-padding-block': '8px',
    '--sniptale-field-padding-inline-start': '13px',
    '--sniptale-field-padding-inline-end': '36px',
    '--sniptale-field-gap': '10px',
    '--sniptale-field-radius': '10px',
    '--sniptale-field-font-size': '13px',
    '--sniptale-field-bg-idle': 'transparent',
    '--sniptale-field-border-idle': 'transparent',
    '--sniptale-field-shadow-idle': 'none',
    '--sniptale-field-bg-hover': COMPACT_INSPECTOR_INTERACTIVE_SURFACE_MIX_VALUE,
    '--sniptale-field-border-hover':
      'color-mix(in srgb, var(--sniptale-color-border-soft) 52%, transparent)',
    '--sniptale-field-shadow-hover': COMPACT_INSPECTOR_INTERACTIVE_HOVER_SHADOW_VALUE,
    '--sniptale-field-bg-active': COMPACT_INSPECTOR_INTERACTIVE_SURFACE_MIX_VALUE,
    '--sniptale-field-border-active': COMPACT_INSPECTOR_INTERACTIVE_BORDER_VALUE,
    '--sniptale-field-shadow-active': COMPACT_INSPECTOR_INTERACTIVE_ACTIVE_SHADOW_VALUE,
    '--sniptale-range-shell-height': '40px',
    '--sniptale-range-shell-padding-inline': '0px',
    '--sniptale-range-shell-radius': '10px',
    '--sniptale-range-shell-border-idle': 'transparent',
    '--sniptale-range-shell-bg-idle': 'transparent',
    '--sniptale-range-shell-shadow-idle': 'none',
    '--sniptale-range-shell-border-hover': 'transparent',
    '--sniptale-range-shell-bg-hover': 'transparent',
    '--sniptale-range-shell-shadow-hover': 'none',
    '--sniptale-range-shell-border-active': 'transparent',
    '--sniptale-range-shell-bg-active': 'transparent',
    '--sniptale-range-shell-shadow-active': 'none',
    '--sniptale-range-track-height': '8px',
    '--sniptale-range-thumb-size': '18px',
    ...style,
  } as CompactInspectorInteractiveControlStyle;
}

export const COMPACT_INSPECTOR_CONTROL_CLASS_NAME = COMPACT_INSPECTOR_SOLID_CONTROL_CLASS_NAME;
export const COMPACT_INSPECTOR_INTERACTIVE_CONTROL_CLASS_NAME =
  'text-[var(--sniptale-color-text-primary)]';
export const COMPACT_INSPECTOR_INTERACTIVE_CONTROL_SURFACE_CLASS_NAME = [
  'h-[var(--sniptale-field-height)]',
  'rounded-[var(--sniptale-field-radius)]',
  'border border-[var(--sniptale-field-border-idle)]',
  'bg-[var(--sniptale-field-bg-idle)]',
  'shadow-[var(--sniptale-field-shadow-idle)]',
  'transition-[border-color,background-color,box-shadow,color]',
  'hover:border-[var(--sniptale-field-border-hover)]',
  'hover:bg-[var(--sniptale-field-bg-hover)]',
  'hover:shadow-[var(--sniptale-field-shadow-hover)]',
  'focus-within:border-[var(--sniptale-field-border-active)]',
  'focus-within:bg-[var(--sniptale-field-bg-active)]',
  'focus-within:shadow-[var(--sniptale-field-shadow-active)]',
].join(' ');
export const COMPACT_INSPECTOR_INTERACTIVE_CONTROL_VISIBLE_CLASS_NAME = [
  'border-[var(--sniptale-field-border-active)]',
  'bg-[var(--sniptale-field-bg-active)]',
  'shadow-[var(--sniptale-field-shadow-active)]',
].join(' ');
