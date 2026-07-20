import { Layers3, Sparkles } from 'lucide-react';
import type { AppLocale } from '../../../../platform/i18n';
import { getProductPreviewCopy } from '../../support/product';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  FLOATING_PREVIEW_STYLE,
  type DesignSystemVariantPreview,
} from '../../support/provider';
import {
  ProductToolbarMenu,
  ProductToolbarMenuBadge,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';

function ProductToolbarPreviewMonitorIcon() {
  return <Layers3 className="sniptale-popover-icon h-4 w-4" />;
}

function renderViewportToolbarMenu(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={152}>
      <ProductToolbarMenu
        title={copy.viewport}
        variant="viewport"
        className="block !w-[280px]"
        style={FLOATING_PREVIEW_STYLE}
      >
        <ProductToolbarMenuItem>
          <ProductToolbarPreviewMonitorIcon />
          <ProductToolbarMenuItemCopy label={copy.nativeSize} hint="1280×720" />
        </ProductToolbarMenuItem>
        <ProductToolbarMenuItem>
          <ProductToolbarPreviewMonitorIcon />
          <ProductToolbarMenuItemCopy label={copy.documentation} hint="1440×1024" />
        </ProductToolbarMenuItem>
      </ProductToolbarMenu>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderCompactToolbarMenu(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={132}>
      <ProductToolbarMenu
        title={copy.capture}
        variant="capture"
        compact
        className="block !w-[250px]"
        style={FLOATING_PREVIEW_STYLE}
      >
        <ProductToolbarMenuItem>
          <Sparkles className="sniptale-popover-icon h-4 w-4" />
          <ProductToolbarMenuItemCopy label={copy.screen} hint={copy.fullArea} />
        </ProductToolbarMenuItem>
      </ProductToolbarMenu>
    </DesignSystemFloatingPreviewFrame>
  );
}

function renderSelectedToolbarMenu(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={132}>
      <ProductToolbarMenu
        variant="viewport"
        className="block !w-[280px]"
        style={FLOATING_PREVIEW_STYLE}
      >
        <ProductToolbarMenuItem selected>
          <ProductToolbarPreviewMonitorIcon />
          <ProductToolbarMenuItemCopy label={copy.currentViewport} hint="1440×900" />
          <ProductToolbarMenuBadge>{copy.active}</ProductToolbarMenuBadge>
        </ProductToolbarMenuItem>
      </ProductToolbarMenu>
    </DesignSystemFloatingPreviewFrame>
  );
}

export function buildProductToolbarMenuPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getProductPreviewCopy(locale);

  return [
    designSystemPreview('product.ui.toolbar-menu', 'default', renderViewportToolbarMenu(copy)),
    designSystemPreview('product.ui.toolbar-menu', 'compact', renderCompactToolbarMenu(copy)),
    designSystemPreview('product.ui.toolbar-menu', 'selected', renderSelectedToolbarMenu(copy)),
  ];
}
