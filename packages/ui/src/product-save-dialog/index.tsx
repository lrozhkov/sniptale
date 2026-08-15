import { ProductModal, ProductModalBody, ProductModalFooter } from '../product-modal';
import {
  ProductSaveDialogFilenameSection,
  ProductSaveDialogHeader,
  ProductSaveDialogPresetSection,
  ProductSaveDialogSystemFolderButton,
} from './sections';
import type { ProductSaveDialogProps } from './types';
export type { ProductSaveDialogPresetItem, ProductSaveDialogProps } from './types';

function ProductSaveDialogContent(props: ProductSaveDialogProps) {
  const filenameProps =
    props.filenamePlaceholder === undefined
      ? {
          filenameLabel: props.filenameLabel,
          filename: props.filename,
          disabled: Boolean(props.disabled),
          onFilenameChange: props.onFilenameChange,
        }
      : {
          filenameLabel: props.filenameLabel,
          filename: props.filename,
          disabled: Boolean(props.disabled),
          filenamePlaceholder: props.filenamePlaceholder,
          onFilenameChange: props.onFilenameChange,
        };

  return (
    <ProductModalBody className="sniptale-modal-scroll">
      <ProductSaveDialogFilenameSection {...filenameProps} />
      <ProductSaveDialogPresetSection
        presetLabel={props.presetLabel}
        presetCount={props.presetCount}
        disabled={Boolean(props.disabled)}
        presetItems={props.presetItems}
        presetsEmptyState={props.presetsEmptyState}
        onChoosePreset={props.onChoosePreset}
      />
      <ProductSaveDialogSystemFolderButton
        systemFolderLabel={props.systemFolderLabel}
        systemFolderHint={props.systemFolderHint}
        disabled={Boolean(props.disabled)}
        onChooseSystemFolder={props.onChooseSystemFolder}
      />
    </ProductModalBody>
  );
}

export function ProductSaveDialogSurface(props: ProductSaveDialogProps) {
  return (
    <div className="flex min-h-0 flex-col" data-ui="shared.ui.product-save-dialog.surface">
      <ProductSaveDialogHeader
        title={props.title}
        subtitle={props.subtitle}
        closeLabel={props.closeLabel}
        onClose={props.onClose}
      />

      <ProductSaveDialogContent {...props} />

      {props.footer ? (
        <ProductModalFooter className="sniptale-save-dialog-footer">
          {props.footer}
        </ProductModalFooter>
      ) : null}
    </div>
  );
}

export function ProductSaveDialog({
  title,
  subtitle,
  closeLabel,
  filenameLabel,
  filename,
  disabled,
  filenamePlaceholder,
  onFilenameChange,
  presetLabel,
  presetCount,
  presetItems,
  presetsEmptyState,
  systemFolderLabel,
  systemFolderHint,
  onChoosePreset,
  onChooseSystemFolder,
  onClose,
  footer,
}: ProductSaveDialogProps) {
  return (
    <ProductModal
      onClose={onClose}
      role="dialog"
      labelledBy="save-dialog-title"
      dialogClassName="sniptale-save-dialog"
    >
      <ProductSaveDialogSurface
        title={title}
        subtitle={subtitle}
        closeLabel={closeLabel}
        filenameLabel={filenameLabel}
        filename={filename}
        disabled={Boolean(disabled)}
        onFilenameChange={onFilenameChange}
        presetLabel={presetLabel}
        presetCount={presetCount}
        presetItems={presetItems}
        presetsEmptyState={presetsEmptyState}
        systemFolderLabel={systemFolderLabel}
        systemFolderHint={systemFolderHint}
        onChoosePreset={onChoosePreset}
        onChooseSystemFolder={onChooseSystemFolder}
        onClose={onClose}
        {...(filenamePlaceholder === undefined ? {} : { filenamePlaceholder })}
        {...(footer === undefined ? {} : { footer })}
      />
    </ProductModal>
  );
}
