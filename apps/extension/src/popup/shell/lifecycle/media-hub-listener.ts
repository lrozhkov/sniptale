import { translate } from '../../../platform/i18n';

import type { PopupLifecycleMediaHubParamsGetter } from './types';

export function createMediaHubListener(getParams: PopupLifecycleMediaHubParamsGetter) {
  return (event: { type: string }) => {
    if (event.type === 'library-changed') {
      void getParams().refreshGalleryStatus();
      return;
    }

    getParams().setGalleryStatus({
      text: translate('popup.common.galleryStatusAttention'),
      pressure: 'critical',
    });
  };
}
