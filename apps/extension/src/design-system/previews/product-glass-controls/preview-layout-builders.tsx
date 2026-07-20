import { Check, MoreVertical } from 'lucide-react';
import type { getProductPreviewCopy } from '../support/product';
import { DesignSystemFloatingPreviewFrame, designSystemPreview } from '../support/provider';
import {
  ProductGlassArrowGrid,
  ProductGlassChip,
  ProductGlassChipIcon,
  ProductGlassColorField,
  ProductGlassColorRow,
  ProductGlassDimMarker,
  ProductGlassIconButton,
  ProductGlassMiniButton,
  ProductGlassOptionGrid,
  ProductGlassRow,
  ProductGlassSectionLabel,
  ProductGlassThreeColumnGrid,
} from '@sniptale/ui/product-glass-controls/controls';

type ProductPreviewCopy = ReturnType<typeof getProductPreviewCopy>;

function buildOptionGridPreview(copy: ProductPreviewCopy) {
  return designSystemPreview(
    'product.ui.glass-controls',
    'option-grid',
    <DesignSystemFloatingPreviewFrame minHeight={136}>
      <div className="max-w-[320px]">
        <ProductGlassSectionLabel>{copy.documentation}</ProductGlassSectionLabel>
        <ProductGlassOptionGrid>
          <ProductGlassChip stacked active>
            <ProductGlassChipIcon>
              <Check className="h-4 w-4" />
            </ProductGlassChipIcon>
            <span>{copy.defaultLabel}</span>
          </ProductGlassChip>
          <ProductGlassChip stacked>
            <ProductGlassChipIcon>
              <MoreVertical className="h-4 w-4" />
            </ProductGlassChipIcon>
            <span>{copy.active}</span>
          </ProductGlassChip>
        </ProductGlassOptionGrid>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildArrowGridPreview(copy: ProductPreviewCopy) {
  return designSystemPreview(
    'product.ui.glass-controls',
    'arrow-grid',
    <DesignSystemFloatingPreviewFrame minHeight={148}>
      <ProductGlassArrowGrid>
        <span />
        <ProductGlassIconButton aria-label={copy.more}>
          <Check className="h-4 w-4" />
        </ProductGlassIconButton>
        <span />
        <ProductGlassIconButton aria-label={copy.less}>
          <Check className="h-4 w-4" />
        </ProductGlassIconButton>
        <ProductGlassDimMarker style={{ fontSize: 12 }}>±</ProductGlassDimMarker>
        <ProductGlassIconButton active aria-label={copy.active}>
          <Check className="h-4 w-4" />
        </ProductGlassIconButton>
        <span />
        <ProductGlassIconButton aria-label={copy.defaultLabel}>
          <Check className="h-4 w-4" />
        </ProductGlassIconButton>
        <span />
      </ProductGlassArrowGrid>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildControlRowPreview(copy: ProductPreviewCopy) {
  return designSystemPreview(
    'product.ui.glass-controls',
    'row',
    <DesignSystemFloatingPreviewFrame minHeight={124}>
      <ProductGlassRow spread className="w-full max-w-[320px]">
        <ProductGlassThreeColumnGrid>
          <ProductGlassChip active>{copy.active}</ProductGlassChip>
          <ProductGlassChip>{copy.defaultLabel}</ProductGlassChip>
          <ProductGlassChip>{copy.more}</ProductGlassChip>
        </ProductGlassThreeColumnGrid>
        <ProductGlassRow>
          <ProductGlassMiniButton aria-label={copy.less}>-</ProductGlassMiniButton>
          <ProductGlassMiniButton aria-label={copy.more}>+</ProductGlassMiniButton>
        </ProductGlassRow>
      </ProductGlassRow>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildColorRowPreview(copy: ProductPreviewCopy) {
  return designSystemPreview(
    'product.ui.glass-controls',
    'color-row',
    <DesignSystemFloatingPreviewFrame minHeight={176}>
      <ProductGlassColorRow className="w-full max-w-[360px]">
        <ProductGlassColorField
          label={copy.active}
          value="#0080ff"
          colors={['#0080ff', '#22c55e', '#ef4444']}
          inputProps={{ readOnly: true, 'aria-label': copy.active }}
        />
        <ProductGlassColorField
          label={copy.defaultLabel}
          value="#111827"
          colors={['#111827', '#f59e0b', '#a855f7']}
          inputProps={{ readOnly: true, 'aria-label': copy.defaultLabel }}
        />
      </ProductGlassColorRow>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildDimMarkerPreview() {
  return designSystemPreview(
    'product.ui.glass-controls',
    'dim-marker',
    <DesignSystemFloatingPreviewFrame minHeight={108}>
      <ProductGlassRow>
        <ProductGlassDimMarker style={{ fontSize: 12 }}>±</ProductGlassDimMarker>
        <ProductGlassDimMarker style={{ fontSize: 12, fontWeight: 700 }}>A</ProductGlassDimMarker>
      </ProductGlassRow>
    </DesignSystemFloatingPreviewFrame>
  );
}

export function buildGridLayoutPreviews(copy: ProductPreviewCopy) {
  return [buildOptionGridPreview(copy), buildArrowGridPreview(copy)];
}

export function buildRowLayoutPreviews(copy: ProductPreviewCopy) {
  return [buildControlRowPreview(copy), buildColorRowPreview(copy), buildDimMarkerPreview()];
}
