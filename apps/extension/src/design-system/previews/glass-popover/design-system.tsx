import type { AppLocale } from '../../../platform/i18n';
import { getSharedPreviewCopy } from '../support/common';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import {
  ProductGlassChip,
  ProductGlassOptionGrid,
  ProductGlassRow,
} from '@sniptale/ui/product-glass-controls';
import { GlassPopover, GlassSection } from './index';

function buildScrollSectionPreviews(copy: ReturnType<typeof getSharedPreviewCopy>) {
  return Array.from({ length: 5 }).map((_, index) => (
    <GlassSection key={index} title={`${copy.sectionPrefix} ${index + 1}`}>
      <div className="text-xs text-[var(--sniptale-color-text-secondary)]">
        {copy.longOptionsStayInside}
      </div>
    </GlassSection>
  ));
}

function buildDefaultPreview(
  copy: ReturnType<typeof getSharedPreviewCopy>
): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.glass-popover',
    'default',
    <DesignSystemFloatingPreviewFrame minHeight={156}>
      <GlassPopover className="!w-[280px]">
        <GlassSection title={copy.quickSettings}>
          <ProductGlassRow>
            <ProductGlassChip active>{copy.yes}</ProductGlassChip>
            <ProductGlassChip>{copy.no}</ProductGlassChip>
          </ProductGlassRow>
        </GlassSection>
      </GlassPopover>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildWidePreview(
  copy: ReturnType<typeof getSharedPreviewCopy>
): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.glass-popover',
    'wide',
    <DesignSystemFloatingPreviewFrame minHeight={170}>
      <GlassPopover className="sniptale-glass-popover--wide !max-w-none">
        <GlassSection title={copy.modePalette}>
          <ProductGlassOptionGrid>
            <ProductGlassChip stacked active>
              {copy.full}
            </ProductGlassChip>
            <ProductGlassChip stacked>{copy.window}</ProductGlassChip>
            <ProductGlassChip stacked>{copy.region}</ProductGlassChip>
          </ProductGlassOptionGrid>
        </GlassSection>
      </GlassPopover>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildScrollPreview(
  copy: ReturnType<typeof getSharedPreviewCopy>
): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.glass-popover',
    'scroll',
    <DesignSystemFloatingPreviewFrame minHeight={252}>
      <GlassPopover className="sniptale-glass-popover-scroll !w-[300px] !max-h-[220px]">
        <div className="space-y-2">{buildScrollSectionPreviews(copy)}</div>
      </GlassPopover>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildSectionPreview(
  copy: ReturnType<typeof getSharedPreviewCopy>
): DesignSystemVariantPreview {
  return designSystemPreview(
    'shared.ui.glass-section',
    'default',
    <div className="max-w-[320px]">
      <GlassSection title={copy.spacingAndLabel}>
        <div className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {copy.oneLogicalGroup}
        </div>
      </GlassSection>
    </div>
  );
}

export function buildGlassPopoverSharedPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getSharedPreviewCopy(locale);

  return [
    buildDefaultPreview(copy),
    buildWidePreview(copy),
    buildScrollPreview(copy),
    buildSectionPreview(copy),
  ];
}
