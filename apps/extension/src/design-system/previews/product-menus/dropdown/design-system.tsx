import { Layers3, Sparkles, Trash2 } from 'lucide-react';
import type { AppLocale } from '../../../../platform/i18n';
import { getProductPreviewCopy } from '../../support/product';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  FLOATING_PREVIEW_STYLE,
  type DesignSystemVariantPreview,
} from '../../support/provider';
import {
  ProductDropdownDivider,
  ProductDropdownItem,
  ProductDropdownMenu,
  ProductTemplateMenuShell,
} from '@sniptale/ui/product-menus/dropdown';

function buildDefaultPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={152} className="justify-start">
      <div className="sniptale-ai-modal-root w-full">
        <ProductDropdownMenu className="block !w-[220px]" style={FLOATING_PREVIEW_STYLE}>
          <ProductDropdownItem className="gap-2">
            <Sparkles className="h-4 w-4" />
            {copy.generate}
          </ProductDropdownItem>
          <ProductDropdownItem className="gap-2">
            <Layers3 className="h-4 w-4" />
            {copy.duplicate}
          </ProductDropdownItem>
        </ProductDropdownMenu>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildTemplatePreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={168} className="justify-start">
      <div className="sniptale-ai-modal-root w-full">
        <div className="relative flex items-start gap-3 overflow-hidden">
          <ProductTemplateMenuShell
            label={copy.template}
            menuLabel={copy.edit}
            open
            menuClassName="block !w-[220px]"
            menuStyle={FLOATING_PREVIEW_STYLE}
          >
            <ProductDropdownItem>{copy.edit}</ProductDropdownItem>
            <ProductDropdownDivider />
            <ProductDropdownItem danger>{copy.delete}</ProductDropdownItem>
          </ProductTemplateMenuShell>
        </div>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

function buildDangerPreview(copy: ReturnType<typeof getProductPreviewCopy>) {
  return (
    <DesignSystemFloatingPreviewFrame minHeight={132} className="justify-start">
      <div className="sniptale-ai-modal-root w-full">
        <ProductDropdownMenu className="block !w-[220px]" style={FLOATING_PREVIEW_STYLE}>
          <ProductDropdownItem danger className="gap-2">
            <Trash2 className="h-4 w-4" />
            {copy.deleteProject}
          </ProductDropdownItem>
        </ProductDropdownMenu>
      </div>
    </DesignSystemFloatingPreviewFrame>
  );
}

export function buildProductDropdownMenuPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getProductPreviewCopy(locale);

  return [
    designSystemPreview('product.ui.dropdown-menu', 'default', buildDefaultPreview(copy)),
    designSystemPreview('product.ui.dropdown-menu', 'template', buildTemplatePreview(copy)),
    designSystemPreview('product.ui.dropdown-menu', 'danger', buildDangerPreview(copy)),
  ];
}
