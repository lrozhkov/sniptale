import type { PopupLifecycleParams } from './params';

export type PopupLifecycleBrowserListenerParams = Pick<
  PopupLifecycleParams,
  'clearAppliedViewportAuthority' | 'refreshActiveTabCapabilities' | 'refreshGalleryStatus'
>;

export type PopupLifecycleBrowserListenerParamsGetter = () => PopupLifecycleBrowserListenerParams;
