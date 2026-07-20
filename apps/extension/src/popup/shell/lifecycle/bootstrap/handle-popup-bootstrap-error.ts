import { translate } from '../../../../platform/i18n';
import type { PopupLifecycleParams } from '../types';
import { popupLifecycleBootstrapLogger } from './logger';

export function handlePopupBootstrapError(
  error: unknown,
  cancelledRef: () => boolean,
  setStartError: PopupLifecycleParams['setStartError'],
  setIsReady: PopupLifecycleParams['setIsReady']
) {
  popupLifecycleBootstrapLogger.error('Failed to bootstrap popup', error);
  if (cancelledRef()) {
    return;
  }

  setStartError(translate('popup.video.loadingPopupError'));
  setIsReady(true);
}
