import type { AppLocale } from '../../../../platform/i18n';
import { getProductPreviewCopy } from '../../support/product';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../../support/provider';

export function buildProductConfirmDialogPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getProductPreviewCopy(locale);

  return [
    designSystemPreview(
      'product.ui.confirm-dialog',
      'default',
      <DesignSystemFloatingPreviewFrame minHeight={220}>
        <ProductConfirmDialog
          title={copy.confirmDeleteTitle}
          message={copy.confirmDeleteMessage}
          cancelText={copy.cancel}
          confirmText={copy.confirmDeleteAction}
        />
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.confirm-dialog',
      'danger',
      <DesignSystemFloatingPreviewFrame minHeight={220}>
        <ProductConfirmDialog
          title={copy.confirmDeleteTitle}
          message={copy.confirmDeleteMessage}
          cancelText={copy.cancel}
          confirmText={copy.confirmDeletion}
        />
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}
