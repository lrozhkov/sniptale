import type { PopupPage } from '../../navigation/actions';

export type PopupNavigationSource =
  | 'command-palette'
  | 'programmatic'
  | 'recording'
  | 'startup'
  | 'tab';

export type PopupNavigationResult = 'committed' | 'failed' | 'superseded' | 'unchanged';

export interface PopupRuntimeNavigationControls {
  isReady: boolean;
  page: PopupPage;
  pendingPage: PopupPage | null;
  showFooter: boolean;
  navigateToPage: (
    page: PopupPage,
    source?: PopupNavigationSource
  ) => Promise<PopupNavigationResult>;
  preloadPage: (page: PopupPage) => Promise<void>;
}
