export const POPUP_STARTUP_TARGETS = [
  'menu',
  'screenshots:quick-actions',
  'screenshots:tab',
  'screenshots:desktop',
  'video:tab',
  'video:camera',
  'video:screen',
  'tools',
  'export',
] as const;

export type PopupStartupTarget = (typeof POPUP_STARTUP_TARGETS)[number];
export type PopupStartupSelection = 'remember-last' | PopupStartupTarget;
export type PersistedPopupPage = 'screenshots' | 'video' | 'menu' | 'tools' | 'export';

export type PopupStartupState = {
  selection: PopupStartupSelection;
  lastPage: PersistedPopupPage;
};
