import { actionFooterSurfaceClassName } from '../../../../ui/popup-shell/action-footer/tokens';

export const footerSurfaceClassName = actionFooterSurfaceClassName;

export function footerActionGridClassName(
  isResultReady: boolean,
  hasLibraryAction: boolean,
  isExporting = false
) {
  if (isExporting) return 'grid grid-cols-1 items-stretch gap-1.5';
  if (!isResultReady) {
    return 'grid grid-cols-1 items-stretch gap-1.5';
  }
  return `grid items-stretch gap-1.5 ${
    hasLibraryAction ? 'grid-cols-[minmax(88px,0.7fr)_minmax(0,1.3fr)]' : 'grid-cols-1'
  }`;
}

export const footerPrimaryButtonIconClassName = 'text-[var(--sniptale-color-text-primary)]';

export const footerPrimaryIdleButtonIconClassName = 'text-[var(--sniptale-color-text-primary)]';
