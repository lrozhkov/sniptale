import { getQuickActionDisplayName } from '../../../../../features/quick-actions-presets/catalog';
import type { QuickAction, ViewportPreset } from '../../../../../contracts/settings';
import { formatHotkeyShort, getQuickActionMeta } from '../../../navigation/actions';

export type QuickActionListDensity = 'regular' | 'compact' | 'dense' | 'tight';

interface QuickActionItemState {
  disabled: boolean;
  meta: string;
  title: string;
}

export const disabledQuickActionListItemClassName = [
  'cursor-not-allowed',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,transparent)]',
  'text-[var(--sniptale-color-text-dim)]',
  'opacity-55',
].join(' ');

export const enabledQuickActionListItemClassName = [
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_88%,transparent)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function shouldShowQuickActionMeta(density: QuickActionListDensity) {
  return density === 'regular' || density === 'compact';
}

function getQuickActionListButtonClassName(density: QuickActionListDensity) {
  switch (density) {
    case 'regular':
      return 'flex min-h-[58px] w-full items-center gap-3 rounded-[12px] px-3 text-left';
    case 'compact':
      return 'flex min-h-[48px] w-full items-center gap-3 rounded-[12px] px-3 text-left';
    case 'dense':
      return 'flex min-h-[40px] w-full items-center gap-2.5 rounded-[12px] px-3 text-left';
    case 'tight':
      return 'flex min-h-[28px] w-full items-center gap-2 rounded-[12px] px-2.5 text-left';
  }
}

function getQuickActionListIconClassName(density: QuickActionListDensity) {
  switch (density) {
    case 'tight':
      return 'inline-flex h-6 w-6 items-center justify-center rounded-md';
    case 'dense':
      return 'inline-flex h-7 w-7 items-center justify-center rounded-md';
    case 'regular':
    case 'compact':
      return 'inline-flex h-9 w-9 items-center justify-center rounded-md';
  }
}

function buildQuickActionTitle(
  action: QuickAction,
  presets: ViewportPreset[],
  disabledTitle?: string | null
): string {
  const parts = [getQuickActionDisplayName(action), getQuickActionMeta(action, presets)];

  if (action.hotkey) {
    parts.push(formatHotkeyShort(action.hotkey));
  }

  if (disabledTitle) {
    parts.push(disabledTitle);
  }

  return parts.filter(Boolean).join(' • ');
}

export function getQuickActionItemState({
  action,
  presets,
  disabledTitle,
}: {
  action: QuickAction;
  presets: ViewportPreset[];
  disabledTitle?: string | null;
}): QuickActionItemState {
  return {
    disabled: Boolean(disabledTitle),
    meta: getQuickActionMeta(action, presets),
    title: buildQuickActionTitle(action, presets, disabledTitle),
  };
}

export {
  cx,
  getQuickActionListButtonClassName,
  getQuickActionListIconClassName,
  shouldShowQuickActionMeta,
};
