import { translate, type TranslationKey } from '../../../../platform/i18n';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';

const APPLY_ONCE_SUCCESS_MESSAGE_KEY = 'content.autoBlur.applyOnceSuccess' satisfies TranslationKey;
const APPLY_ONCE_EMPTY_MESSAGE_KEY = 'content.autoBlur.applyOnceEmpty' satisfies TranslationKey;

export function reportAutoBlurApplyResult(addedCount: number) {
  if (addedCount === 0) {
    showToast(translate(APPLY_ONCE_EMPTY_MESSAGE_KEY), 'info');
    return;
  }

  showToast(
    translate(APPLY_ONCE_SUCCESS_MESSAGE_KEY).replace('{count}', String(addedCount)),
    'success'
  );
}
