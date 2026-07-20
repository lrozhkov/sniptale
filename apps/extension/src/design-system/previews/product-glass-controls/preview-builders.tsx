import { Check, MoreVertical } from 'lucide-react';
import type { getProductPreviewCopy } from '../support/product';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import {
  ProductGlassBoldButton,
  ProductGlassChip,
  ProductGlassColorField,
  ProductGlassDestructiveButton,
  ProductGlassIconButton,
  ProductGlassInput,
  ProductGlassMiniButton,
  ProductGlassPresetItem,
  ProductGlassPresetList,
  ProductGlassPresetMeta,
  ProductGlassPresetName,
  ProductGlassPresetPreview,
  ProductGlassRange,
  ProductGlassRangeMeta,
  ProductGlassRow,
  ProductGlassSwitch,
  ProductGlassToggleRow,
} from '@sniptale/ui/product-glass-controls/controls';
import { buildGridLayoutPreviews, buildRowLayoutPreviews } from './preview-layout-builders';

type ProductPreviewCopy = ReturnType<typeof getProductPreviewCopy>;

function buildPrimaryControlPreviews(copy: ProductPreviewCopy) {
  return [
    designSystemPreview(
      'product.ui.glass-controls',
      'chip',
      <DesignSystemFloatingPreviewFrame minHeight={112}>
        <ProductGlassRow>
          <ProductGlassChip active>{copy.active}</ProductGlassChip>
          <ProductGlassChip>{copy.defaultLabel}</ProductGlassChip>
        </ProductGlassRow>
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.glass-controls',
      'icon-button',
      <DesignSystemFloatingPreviewFrame minHeight={112}>
        <ProductGlassRow>
          <ProductGlassIconButton active aria-label={copy.active}>
            <Check className="h-4 w-4" />
          </ProductGlassIconButton>
          <ProductGlassIconButton aria-label={copy.defaultLabel}>
            <MoreVertical className="h-4 w-4" />
          </ProductGlassIconButton>
        </ProductGlassRow>
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.glass-controls',
      'switch',
      <DesignSystemFloatingPreviewFrame minHeight={132}>
        <ProductGlassToggleRow
          className="max-w-[320px]"
          title={copy.autoMode}
          hint={copy.enabledByDefault}
          control={<ProductGlassSwitch on aria-label={copy.autoMode} />}
        />
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}

function buildInputPreview(copy: ProductPreviewCopy) {
  return designSystemPreview(
    'product.ui.glass-controls',
    'input',
    <DesignSystemFloatingPreviewFrame minHeight={112}>
      <ProductGlassRow>
        <ProductGlassMiniButton aria-label={copy.less}>-</ProductGlassMiniButton>
        <ProductGlassInput
          className="w-[92px]"
          value="24"
          readOnly
          aria-label={copy.defaultLabel}
        />
        <ProductGlassMiniButton aria-label={copy.more}>+</ProductGlassMiniButton>
      </ProductGlassRow>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildRangePreview(copy: ProductPreviewCopy) {
  return designSystemPreview(
    'product.ui.glass-controls',
    'range',
    <DesignSystemFloatingPreviewFrame minHeight={136}>
      <div className="max-w-[320px]">
        <ProductGlassRange className="w-full" defaultValue={60} />
        <ProductGlassRangeMeta>
          <span>{copy.less}</span>
          <span>60%</span>
          <span>{copy.more}</span>
        </ProductGlassRangeMeta>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildPresetListPreview(copy: ProductPreviewCopy) {
  return designSystemPreview(
    'product.ui.glass-controls',
    'preset-list',
    <DesignSystemFloatingPreviewFrame minHeight={176}>
      <ProductGlassPresetList className="max-w-[320px]">
        <ProductGlassPresetItem active>
          <ProductGlassPresetPreview />
          <ProductGlassPresetMeta>
            <ProductGlassPresetName>{copy.presetA}</ProductGlassPresetName>
          </ProductGlassPresetMeta>
        </ProductGlassPresetItem>
        <ProductGlassPresetItem>
          <ProductGlassPresetPreview />
          <ProductGlassPresetMeta>
            <ProductGlassPresetName>{copy.presetB}</ProductGlassPresetName>
          </ProductGlassPresetMeta>
        </ProductGlassPresetItem>
      </ProductGlassPresetList>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildValueControlPreviews(copy: ProductPreviewCopy) {
  return [buildInputPreview(copy), buildRangePreview(copy), buildPresetListPreview(copy)];
}

function buildColorAndActionPreviews(copy: ProductPreviewCopy) {
  return [
    designSystemPreview(
      'product.ui.glass-controls',
      'color-trigger',
      <DesignSystemFloatingPreviewFrame minHeight={148}>
        <ProductGlassColorField
          label={copy.active}
          value="#0080ff"
          colors={['#0080ff', '#22c55e', '#ef4444']}
          inputProps={{ readOnly: true, 'aria-label': copy.active }}
        />
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.glass-controls',
      'bold-button',
      <DesignSystemFloatingPreviewFrame minHeight={112}>
        <ProductGlassRow>
          <ProductGlassBoldButton active aria-label={copy.active}>
            <span className="text-[14px] font-bold">B</span>
          </ProductGlassBoldButton>
        </ProductGlassRow>
      </DesignSystemFloatingPreviewFrame>
    ),
    designSystemPreview(
      'product.ui.glass-controls',
      'destructive',
      <DesignSystemFloatingPreviewFrame minHeight={112} className="justify-start">
        <ProductGlassDestructiveButton>{copy.deleteProject}</ProductGlassDestructiveButton>
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}

export function buildProductGlassControlsVariantPreviews(
  copy: ProductPreviewCopy
): DesignSystemVariantPreview[] {
  return [
    ...buildPrimaryControlPreviews(copy),
    ...buildValueControlPreviews(copy),
    ...buildColorAndActionPreviews(copy),
    ...buildGridLayoutPreviews(copy),
    ...buildRowLayoutPreviews(copy),
  ];
}
