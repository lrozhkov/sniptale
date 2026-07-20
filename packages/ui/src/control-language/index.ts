import { DANGER_FOCUS_BACKGROUND_CLASS_NAME } from './styles.constants';

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type ControlDensity = 'compact' | 'default';
type ControlTone = 'default' | 'accent' | 'danger' | 'info';
type ControlShape = 'rounded' | 'pill';

const ACTION_FOCUS_RING_CLASS_NAME =
  'focus-visible:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]';

const BASE_ACTION_CLASS_NAME = [
  'inline-flex h-10 min-h-10 items-center justify-center gap-2 whitespace-nowrap border-none outline-none',
  'cursor-pointer',
  'text-[12px] font-medium leading-none transition-all duration-150 focus-visible:outline-none',
  ACTION_FOCUS_RING_CLASS_NAME,
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none',
  'disabled:hover:translate-y-0',
].join(' ');

const BASE_ICON_ACTION_CLASS_NAME = [
  'inline-flex shrink-0 items-center justify-center border-none outline-none transition-all duration-150',
  'cursor-pointer',
  ACTION_FOCUS_RING_CLASS_NAME,
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  'disabled:hover:translate-y-0',
].join(' ');

const IDLE_ICON_BASE_CLASS_NAME = [
  'bg-transparent',
  'text-[var(--sniptale-color-text-secondary)] active:translate-y-px',
].join(' ');

const SECONDARY_ACTION_TONE_CLASS_NAME = [
  'bg-transparent',
  'text-[var(--sniptale-color-text-primary)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary-strong)] active:translate-y-px',
].join(' ');

const SEGMENTED_IDLE_TONE_CLASS_NAME = [
  'bg-transparent',
  'text-[var(--sniptale-color-text-primary)]',
  'hover:text-[var(--sniptale-color-text-primary-strong)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_66%,transparent)]',
  'active:translate-y-px',
].join(' ');

const ACCENT_ACTION_TONE_CLASS_NAME = [
  'bg-transparent',
  'text-[var(--sniptale-color-text-primary-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_78%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
  'hover:text-[var(--sniptale-color-accent-emphasis)]',
  'focus-visible:text-[var(--sniptale-color-accent-emphasis)] active:translate-y-px',
].join(' ');

const DANGER_ACTION_TONE_CLASS_NAME = [
  'bg-transparent',
  'text-[color:color-mix(in_srgb,var(--sniptale-color-danger)_72%,var(--sniptale-color-text-primary)_28%)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_34%,var(--sniptale-color-surface-hover)_66%)]',
  DANGER_FOCUS_BACKGROUND_CLASS_NAME,
  'hover:text-[var(--sniptale-color-danger)] active:translate-y-px',
].join(' ');

const SELECTED_ACTION_TONE_CLASS_NAME = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
  'text-[var(--sniptale-color-text-primary-strong)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_86%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_86%,transparent)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_24%,transparent)]',
].join(' ');

const INFO_ICON_TONE_CLASS_NAME = [
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)]',
  'hover:text-[var(--sniptale-color-info)]',
].join(' ');

const DANGER_ICON_TONE_CLASS_NAME = [
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_24%,var(--sniptale-color-surface-hover)_76%)]',
  'hover:text-[var(--sniptale-color-danger)]',
].join(' ');

const ACTIVE_ICON_TONE_CLASS_NAME = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_84%,transparent)]',
  'text-[var(--sniptale-color-accent)]',
  'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_22%,transparent)]',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_92%,transparent)]',
  'hover:text-[var(--sniptale-color-accent-emphasis)]',
].join(' ');

function getDensityClassName(density: ControlDensity, shape: ControlShape) {
  if (density === 'compact') {
    return shape === 'pill' ? 'rounded-full px-3.5' : 'rounded-[12px] px-3.5';
  }

  return shape === 'pill' ? 'rounded-full px-4' : 'rounded-[12px] px-4';
}

function getActionToneClassName(tone: ControlTone) {
  if (tone === 'accent') {
    return ACCENT_ACTION_TONE_CLASS_NAME;
  }

  if (tone === 'danger') {
    return DANGER_ACTION_TONE_CLASS_NAME;
  }

  return SECONDARY_ACTION_TONE_CLASS_NAME;
}

function getIconToneClassName(tone: ControlTone, active: boolean) {
  if (active) {
    return ACTIVE_ICON_TONE_CLASS_NAME;
  }

  if (tone === 'danger') {
    return DANGER_ICON_TONE_CLASS_NAME;
  }

  if (tone === 'info') {
    return INFO_ICON_TONE_CLASS_NAME;
  }

  if (tone === 'accent') {
    return [
      'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
      'hover:text-[var(--sniptale-color-accent-emphasis)]',
    ].join(' ');
  }

  return [
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)]',
    'hover:text-[var(--sniptale-color-text-primary)]',
  ].join(' ');
}

export function getControlPrimaryButtonClassName(props?: {
  density?: ControlDensity;
  shape?: ControlShape;
}) {
  return joinClassNames(
    BASE_ACTION_CLASS_NAME,
    getDensityClassName(props?.density ?? 'default', props?.shape ?? 'rounded'),
    ACCENT_ACTION_TONE_CLASS_NAME
  );
}

export function getControlSecondaryButtonClassName(props?: {
  density?: ControlDensity;
  shape?: ControlShape;
  tone?: Exclude<ControlTone, 'accent'> | 'default';
}) {
  return joinClassNames(
    BASE_ACTION_CLASS_NAME,
    getDensityClassName(props?.density ?? 'default', props?.shape ?? 'rounded'),
    getActionToneClassName(props?.tone ?? 'default')
  );
}

export function getControlIconButtonClassName(props?: {
  active?: boolean;
  density?: ControlDensity;
  tone?: ControlTone;
}) {
  const density = props?.density ?? 'default';
  const active = props?.active ?? false;

  return joinClassNames(
    BASE_ICON_ACTION_CLASS_NAME,
    density === 'compact' ? 'h-10 w-10 rounded-[12px]' : 'h-9 w-9 rounded-[12px]',
    active ? '' : IDLE_ICON_BASE_CLASS_NAME,
    getIconToneClassName(props?.tone ?? 'default', active)
  );
}

export function getControlSegmentedOptionClassName(props?: {
  active?: boolean;
  density?: ControlDensity;
  layout?: 'inline' | 'tile';
}) {
  const density = props?.density ?? 'default';
  const layout = props?.layout ?? 'inline';

  return joinClassNames(
    BASE_ACTION_CLASS_NAME,
    layout === 'tile'
      ? 'min-h-[88px] rounded-[14px] px-4 py-4'
      : density === 'compact'
        ? 'rounded-[12px] px-3.5'
        : 'rounded-[12px] px-4',
    props?.active ? SELECTED_ACTION_TONE_CLASS_NAME : SEGMENTED_IDLE_TONE_CLASS_NAME
  );
}

export function getFormPanelSurfaceClassName(props?: { compact?: boolean }) {
  return joinClassNames(
    props?.compact ? 'rounded-[16px] p-4' : 'rounded-[20px] p-5',
    'border border-[var(--sniptale-color-border-soft)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,var(--sniptale-color-surface-canvas)_8%)]',
    'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_34%,transparent)]'
  );
}

export function getFormActionRowClassName(props?: { emphasis?: 'default' | 'primary' }) {
  if (props?.emphasis === 'primary') {
    return joinClassNames(
      'flex items-center justify-between gap-4 rounded-[16px] px-4 py-3',
      'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_88%,transparent)]',
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,var(--sniptale-color-surface-canvas)_18%)]',
      'shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-border-subtle)_32%,transparent)]'
    );
  }

  return joinClassNames(
    'flex items-center justify-between gap-3 rounded-[12px] px-3 py-2.5',
    'border border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_72%,var(--sniptale-color-surface-canvas)_28%)]',
    'text-[var(--sniptale-color-text-secondary)] transition-colors',
    'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_74%,transparent)]'
  );
}
