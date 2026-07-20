import { bootstrapPopupState } from '../../bootstrap';

import type { PopupLifecycleBootstrapParamsGetter } from '../types';
import { applyBootstrapSuccess } from './apply-bootstrap-success';
import { handlePopupBootstrapError } from './handle-popup-bootstrap-error';
import { refreshPopupSecondaryState } from './refresh-popup-secondary-state';

export async function bootstrapPopupLifecycle({
  cancelledRef,
  getParams,
}: {
  cancelledRef: () => boolean;
  getParams: PopupLifecycleBootstrapParamsGetter;
}) {
  const { refreshActiveTabCapabilities, refreshGalleryStatus, setIsReady, setStartError } =
    getParams();

  try {
    const bootstrapState = await bootstrapPopupState();

    if (cancelledRef()) {
      return;
    }

    applyBootstrapSuccess(getParams(), bootstrapState);
    await refreshPopupSecondaryState({
      cancelledRef,
      refreshActiveTabCapabilities,
      refreshGalleryStatus,
    });

    if (cancelledRef()) {
      return;
    }

    setIsReady(true);
  } catch (error) {
    handlePopupBootstrapError(error, cancelledRef, setStartError, setIsReady);
  }
}
