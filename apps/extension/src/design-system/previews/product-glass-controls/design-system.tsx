import type { AppLocale } from '../../../platform/i18n';
import { getProductPreviewCopy } from '../support/product';
import type { DesignSystemVariantPreview } from '../support/provider';
import { buildProductGlassControlsVariantPreviews } from './preview-builders';

export function buildProductGlassControlsPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getProductPreviewCopy(locale);

  return buildProductGlassControlsVariantPreviews(copy);
}
