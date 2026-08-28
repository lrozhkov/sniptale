import { actionFooterSurfaceClassName } from '../../../../ui/popup-shell/action-footer/tokens';

export const footerSurfaceClassName = actionFooterSurfaceClassName;

export function footerActionGridClassName(
  isResultReady: boolean,
  hasLibraryAction: boolean,
  isExporting = false
) {
  if (isExporting) return 'grid grid-cols-1 items-stretch gap-1.5';
  if (!isResultReady) {
    return 'grid grid-cols-[minmax(0,1fr)_48px_48px] items-stretch gap-1.5';
  }
  return `grid items-stretch gap-1.5 ${
    hasLibraryAction ? 'grid-cols-[minmax(88px,0.7fr)_minmax(0,1.3fr)]' : 'grid-cols-1'
  }`;
}

export const footerCopyButtonBaseClassName = [
  'group inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px]',
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
