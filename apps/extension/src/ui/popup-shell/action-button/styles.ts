import type { PopupActionButtonTone } from './types';

const POPUP_ACTION_BUTTON_DISABLED_CLASS_NAME = [
  'cursor-not-allowed',
  'border-none bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_46%,transparent)]',
  'text-[var(--sniptale-color-text-dim)] opacity-60',
].join(' ');

const POPUP_ACTION_BUTTON_PRIMARY_CLASS_NAME = [
  'border-none bg-transparent',
  'text-[var(--sniptale-color-text-primary-strong)] shadow-none',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_48%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_52%,transparent)]',
  'hover:text-[var(--sniptale-color-accent-emphasis)]',
  'focus-visible:text-[var(--sniptale-color-accent-emphasis)] active:translate-y-px',
].join(' ');

const POPUP_ACTION_BUTTON_SECONDARY_CLASS_NAME = [
  'border-none bg-transparent',
  'text-[var(--sniptale-color-text-primary)] shadow-none',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_48%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_52%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)] active:translate-y-px',
].join(' ');

export function getPopupActionButtonRootClassName(tone: PopupActionButtonTone, disabled: boolean) {
  if (disabled) {
    return POPUP_ACTION_BUTTON_DISABLED_CLASS_NAME;
  }

  if (tone === 'primary') {
    return POPUP_ACTION_BUTTON_PRIMARY_CLASS_NAME;
  }

  if (tone === 'gallery') {
    return POPUP_ACTION_BUTTON_SECONDARY_CLASS_NAME;
  }

  return POPUP_ACTION_BUTTON_SECONDARY_CLASS_NAME;
}
