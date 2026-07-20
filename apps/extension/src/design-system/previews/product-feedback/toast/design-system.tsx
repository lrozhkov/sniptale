import type { AppLocale } from '../../../../platform/i18n';
import { getProductPreviewCopy } from '../../support/product';
import { ProductCountdownToast, ProductToast } from '@sniptale/ui/product-feedback/toast';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../../support/provider';

export function buildProductToastPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getProductPreviewCopy(locale);

  return [
    designSystemPreview(
      'product.ui.toast',
      'success',
      <DesignSystemFloatingPreviewFrame minHeight={112}>
        <ProductToast message={copy.successToast} tone="success" duration={60_000} />
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.toast',
      'error',
      <DesignSystemFloatingPreviewFrame minHeight={112}>
        <ProductToast message={copy.errorToast} tone="error" duration={60_000} />
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.toast',
      'countdown',
      <DesignSystemFloatingPreviewFrame minHeight={132}>
        <ProductCountdownToast
          count={3}
          labelPrefix={copy.countdownPrefix}
          labelSuffix={copy.countdownSuffix}
          cancelLabel={copy.cancel}
        />
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}
