import {
  AUTO_BLUR_CATEGORIES,
  type AutoBlurCategory,
} from '../../../../features/highlighter/contracts/auto-blur';
import { translate } from '../../../../platform/i18n';

export function getAutoBlurCategoryLabel(category: AutoBlurCategory): string {
  switch (category) {
    case AUTO_BLUR_CATEGORIES.email:
      return translate('content.autoBlur.categoryEmail');
    case AUTO_BLUR_CATEGORIES.phone:
      return translate('content.autoBlur.categoryPhone');
    case AUTO_BLUR_CATEGORIES.urlOrLogin:
      return translate('content.autoBlur.categoryUrlOrLogin');
    case AUTO_BLUR_CATEGORIES.ipAddress:
      return translate('content.autoBlur.categoryIpAddress');
    case AUTO_BLUR_CATEGORIES.bankCard:
      return translate('content.autoBlur.categoryBankCard');
    case AUTO_BLUR_CATEGORIES.documentNumber:
      return translate('content.autoBlur.categoryDocumentNumber');
  }
}
