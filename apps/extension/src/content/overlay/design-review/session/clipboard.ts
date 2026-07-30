import { writeBrowserClipboardText } from '@sniptale/platform/browser/clipboard';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { translate, type TranslationKey } from '../../../../platform/i18n';

/** Copies Design Review evidence with user-visible success and denial recovery. */
export async function copyDesignReviewText(
  text: string,
  successMessageKey: TranslationKey
): Promise<boolean> {
  try {
    await writeBrowserClipboardText(text);
    showToast(translate(successMessageKey), 'success');
    return true;
  } catch {
    showToast(translate('content.designReview.copyFailed'), 'error');
    return false;
  }
}
