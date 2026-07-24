import { translate } from '../../../../platform/i18n';
import type { PopupLifecycleBootstrapParams } from '../contracts';
import { popupLifecycleBootstrapLogger } from './logger';

export function handlePopupBootstrapError(
  error: unknown,
  cancelledRef: () => boolean,
  setStartError: PopupLifecycleBootstrapParams['setStartError'],
  setIsReady: PopupLifecycleBootstrapParams['setIsReady']
) {
  popupLifecycleBootstrapLogger.error('Failed to bootstrap popup', error);
  if (cancelledRef()) {
    return;
  }

  setStartError(translate('popup.video.loadingPopupError'));
  setIsReady(true);
}
