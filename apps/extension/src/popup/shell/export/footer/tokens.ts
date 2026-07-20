import { actionFooterSurfaceClassName } from '../../../../ui/popup-shell/action-footer/tokens';

export const footerSurfaceClassName = actionFooterSurfaceClassName;

export const footerActionGridClassName =
  'grid grid-cols-[minmax(0,1fr)_48px_48px_48px] items-stretch gap-1.5';

export const footerCopyButtonBaseClassName = [
  'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]',
  'transition-all',
  'outline-none focus-visible:outline-none',
].join(' ');

export const footerCopyButtonEnabledClassName = [
  'border-none bg-transparent text-[var(--sniptale-color-text-secondary)] shadow-none',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_42%,transparent)]',
  'hover:text-[var(--sniptale-color-text-primary)]',
].join(' ');

export const footerCopyButtonDisabledClassName = [
  'cursor-not-allowed border-none bg-transparent text-[var(--sniptale-color-text-dim)] opacity-50',
].join(' ');

export const footerPrimaryButtonIconClassName = 'text-[var(--sniptale-color-text-primary)]';

export const footerPrimaryIdleButtonIconClassName = [
  'text-[var(--sniptale-color-text-primary)]',
  'group-hover:text-[var(--sniptale-color-accent-emphasis)]',
  'group-focus-visible:text-[var(--sniptale-color-accent-emphasis)]',
].join(' ');
