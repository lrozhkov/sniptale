export const POPUP_STARTUP_TARGETS = [
  'screenshots:quick-actions',
  'screenshots:tab',
  'screenshots:desktop',
  'screenshots:tools',
  'video:tab',
  'video:area',
  'video:camera',
  'video:screen',
  'export',
] as const;

export type PopupStartupTarget = (typeof POPUP_STARTUP_TARGETS)[number];
export type PopupStartupSelection = 'remember-last' | PopupStartupTarget;
export type PersistedPopupPage = 'home' | 'video' | 'export';

export type PopupStartupState = {
  selection: PopupStartupSelection;
  lastPage: PersistedPopupPage;
};
