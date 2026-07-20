import type { PopupLifecycleParams } from './params';

export type PopupLifecycleMediaHubParams = Pick<
  PopupLifecycleParams,
  'refreshGalleryStatus' | 'setGalleryStatus'
>;

export type PopupLifecycleMediaHubParamsGetter = () => PopupLifecycleMediaHubParams;
