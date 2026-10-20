import type { PopupActionButtonTone } from './types';

const POPUP_ACTION_BUTTON_DISABLED_CLASS_NAME = [
  'cursor-not-allowed',
  'border-none bg-transparent',
  'text-[var(--sniptale-color-text-dim)] opacity-60',
].join(' ');

const POPUP_ACTION_BUTTON_PRIMARY_CLASS_NAME = [
  'border-none bg-[var(--sniptale-color-surface-input)]',
  'text-[var(--sniptale-color-text-primary)] shadow-none',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_12%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-text-primary)_12%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary-strong)]',
  'focus-visible:text-[var(--sniptale-color-text-primary-strong)]',
].join(' ');

const POPUP_ACTION_BUTTON_SECONDARY_CLASS_NAME = [
  'border-none bg-transparent',
  'text-[var(--sniptale-color-text-secondary)] shadow-none',
  'hover:bg-transparent focus-visible:bg-transparent',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

const POPUP_ACTION_BUTTON_DANGER_CLASS_NAME = [
  'border-none bg-transparent text-[var(--sniptale-color-text-primary)] shadow-none',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-danger)_14%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-danger)_18%,transparent)]',
  'hover:text-[var(--sniptale-color-danger)] focus-visible:text-[var(--sniptale-color-danger)]',
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

  if (tone === 'danger') return POPUP_ACTION_BUTTON_DANGER_CLASS_NAME;

  return POPUP_ACTION_BUTTON_SECONDARY_CLASS_NAME;
}
