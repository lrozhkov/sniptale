import { Trash2 } from 'lucide-react';
import type { AppLocale } from '../../../platform/i18n';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import {
  ProductGlassToolbar,
  ProductGlassToolbarButton,
  ProductGlassToolbarDivider,
} from '@sniptale/ui/product-glass-toolbar';

export function buildProductGlassToolbarPreviews(_locale: AppLocale): DesignSystemVariantPreview[] {
  return [
    designSystemPreview(
      'product.ui.glass-toolbar',
      'default',
      <DesignSystemFloatingPreviewFrame minHeight={112}>
        <ProductGlassToolbar>
          <ProductGlassToolbarButton>B</ProductGlassToolbarButton>
          <ProductGlassToolbarDivider />
          <ProductGlassToolbarButton>I</ProductGlassToolbarButton>
        </ProductGlassToolbar>
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.glass-toolbar',
      'active',
      <DesignSystemFloatingPreviewFrame minHeight={112}>
        <ProductGlassToolbar>
          <ProductGlassToolbarButton active>T</ProductGlassToolbarButton>
        </ProductGlassToolbar>
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.glass-toolbar',
      'danger',
      <DesignSystemFloatingPreviewFrame minHeight={112}>
        <ProductGlassToolbar>
          <ProductGlassToolbarButton danger>
            <Trash2 className="h-4 w-4" />
          </ProductGlassToolbarButton>
        </ProductGlassToolbar>
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}
