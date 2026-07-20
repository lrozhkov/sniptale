import type { AppLocale } from '../../../platform/i18n';
import { getProductPreviewCopy } from '../support/product';
import {
  DesignSystemFloatingPreviewFrame,
  designSystemPreview,
  type DesignSystemVariantPreview,
} from '../support/provider';
import { ProductSaveDialog } from '@sniptale/ui/product-save-dialog';

export function buildProductSaveDialogPreviews(locale: AppLocale): DesignSystemVariantPreview[] {
  const copy = getProductPreviewCopy(locale);

  return [
    designSystemPreview(
      'product.ui.modal-shell',
      'save-dialog',
      <DesignSystemFloatingPreviewFrame minHeight={420}>
        <ProductSaveDialog
          title={copy.saveDialogTitle}
          subtitle={copy.saveDialogSubtitle}
          closeLabel={copy.close}
          filenameLabel={copy.saveDialogFilenameLabel}
          filename={copy.saveDialogFilenameValue}
          filenamePlaceholder={copy.saveDialogFilenamePlaceholder}
          onFilenameChange={() => {}}
          presetLabel={copy.saveDialogPresetPathsLabel}
          presetCount="1"
          presetItems={[
            { id: 'project', title: copy.saveDialogItemTitle, path: '/design/reports' },
          ]}
          presetsEmptyState={copy.saveDialogNoPresets}
          systemFolderLabel={copy.saveDialogOtherFolderLabel}
          systemFolderHint={copy.saveDialogOtherFolderHint}
          onChoosePreset={() => {}}
          onChooseSystemFolder={() => {}}
          onClose={() => {}}
        />
      </DesignSystemFloatingPreviewFrame>
    ),
  ];
}
