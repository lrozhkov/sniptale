import type { ReactNode } from 'react';
import type { AppLocale } from '../../platform/i18n';
import { buildCommandPaletteSharedPreviews } from './command-palette/design-system';
import { buildCompactInspectorControlsSharedPreviews } from './compact-inspector-controls/design-system';
import { buildContentPopoverSharedPreviews } from './content-popover-adapter/design-system';
import { buildContentSizeTooltipSharedPreviews } from './content-size-tooltip/design-system';
import { buildContentToolbarSharedPreviews } from './content-toolbar/design-system';
import { buildAnnotatableImageSurfaceSharedPreviews } from './annotatable-image-surface/design-system';
import { buildEditorChromeSharedPreviews } from './editor-chrome/design-system';
import { buildExpiredOverlaySharedPreviews } from './expired-overlay/design-system';
import { buildGlassPopoverSharedPreviews } from './glass-popover/design-system';
import { buildGlassSelectSharedPreviews } from './glass-select/design-system';
import { buildInspectorShellSharedPreviews } from './inspector-shell/design-system';
import { buildProductConfirmDialogPreviews } from './product-feedback/confirm-dialog/design-system';
import { buildProductDropdownMenuPreviews } from './product-menus/dropdown/design-system';
import { buildProductFormControlsPreviews } from './product-form-controls/design-system';
import { buildProductGlassControlsPreviews } from './product-glass-controls/design-system';
import { buildProductGlassToolbarPreviews } from './product-glass-toolbar/design-system';
import { buildProductModalPreviews } from './product-modal/design-system';
import { buildProductSaveDialogPreviews } from './product-save-dialog/design-system';
import { buildProductToolbarMenuPreviews } from './product-menus/toolbar/design-system';
import { buildProductToastPreviews } from './product-feedback/toast/design-system';
import { buildPopupActionButtonSharedPreviews } from './popup-shell/action-button/design-system';
import { buildPopupFooterSharedPreviews } from './popup-shell/footer/preview';
import { buildPopupSelectSharedPreviews } from './popup-shell/select/design-system';
import { buildScenarioCaptureMetadataDialogPreviews } from './scenario-capture-metadata-dialog/design-system';
import { buildSearchableProjectPickerPreviews } from './searchable-project-picker/design-system';
import { buildSkeletonSharedPreviews } from './skeleton/design-system';

export function buildDesignSystemVariantPreviewMap(locale: AppLocale): Map<string, ReactNode> {
  return new Map(
    [
      ...buildContentPopoverSharedPreviews(locale),
      ...buildContentSizeTooltipSharedPreviews(locale),
      ...buildCommandPaletteSharedPreviews(locale),
      ...buildCompactInspectorControlsSharedPreviews(locale),
      ...buildContentToolbarSharedPreviews(locale),
      ...buildAnnotatableImageSurfaceSharedPreviews(locale),
      ...buildEditorChromeSharedPreviews(locale),
      ...buildExpiredOverlaySharedPreviews(locale),
      ...buildGlassPopoverSharedPreviews(locale),
      ...buildGlassSelectSharedPreviews(locale),
      ...buildInspectorShellSharedPreviews(locale),
      ...buildProductConfirmDialogPreviews(locale),
      ...buildProductDropdownMenuPreviews(locale),
      ...buildProductFormControlsPreviews(locale),
      ...buildProductGlassControlsPreviews(locale),
      ...buildProductGlassToolbarPreviews(locale),
      ...buildProductModalPreviews(locale),
      ...buildProductSaveDialogPreviews(locale),
      ...buildProductToolbarMenuPreviews(locale),
      ...buildProductToastPreviews(locale),
      ...buildPopupActionButtonSharedPreviews(locale),
      ...buildPopupFooterSharedPreviews(locale),
      ...buildPopupSelectSharedPreviews(locale),
      ...buildScenarioCaptureMetadataDialogPreviews(locale),
      ...buildSearchableProjectPickerPreviews(locale),
      ...buildSkeletonSharedPreviews(locale),
    ].map((item) => [`${item.componentId}.${item.variantId}`, item.preview] as const)
  );
}
