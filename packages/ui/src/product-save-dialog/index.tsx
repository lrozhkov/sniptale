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
          onFilenameChange: props.onFilenameChange,
        }
      : {
          filenameLabel: props.filenameLabel,
          filename: props.filename,
          filenamePlaceholder: props.filenamePlaceholder,
          onFilenameChange: props.onFilenameChange,
        };

  return (
    <ProductModalBody className="sniptale-modal-scroll">
      <ProductSaveDialogFilenameSection {...filenameProps} />
      <ProductSaveDialogPresetSection
        presetLabel={props.presetLabel}
        presetCount={props.presetCount}
        presetItems={props.presetItems}
        presetsEmptyState={props.presetsEmptyState}
        onChoosePreset={props.onChoosePreset}
      />
      <ProductSaveDialogSystemFolderButton
        systemFolderLabel={props.systemFolderLabel}
        systemFolderHint={props.systemFolderHint}
        onChooseSystemFolder={props.onChooseSystemFolder}
      />
    </ProductModalBody>
  );
}

function ProductSaveDialogFrame(props: ProductSaveDialogProps) {
  return (
    <>
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
    </>
  );
}

export function ProductSaveDialog({
  title,
  subtitle,
  closeLabel,
  filenameLabel,
  filename,
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
      <ProductSaveDialogFrame
        title={title}
        subtitle={subtitle}
        closeLabel={closeLabel}
        filenameLabel={filenameLabel}
        filename={filename}
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
