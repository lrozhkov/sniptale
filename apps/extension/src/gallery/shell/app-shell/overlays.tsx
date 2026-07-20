import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { BackupExportModal, ImportConflictModal, StorageManagerModal } from '../../library/modals';
import { PreviewPanel } from '../../library/preview';
import type { GalleryAppLayoutProps } from './types';

function GalleryStorageOverlay(
  props: Pick<GalleryAppLayoutProps, 'onStorageCleanup' | 'onStorageManagerClose' | 'state'>
) {
  if (!props.state.storage.showStorageManager) {
    return null;
  }

  return (
    <StorageManagerModal
      report={props.state.storage.cleanupReport}
      onClose={props.onStorageManagerClose}
      onRun={async (group) => props.onStorageCleanup(group)}
    />
  );
}

function GalleryImportOverlay(
  props: Pick<GalleryAppLayoutProps, 'onImport' | 'onPendingImportClose' | 'state'>
) {
  if (!props.state.storage.pendingImport) {
    return null;
  }

  return (
    <ImportConflictModal
      summary={props.state.storage.pendingImport.summary}
      onClose={props.onPendingImportClose}
      onImport={async (strategy) => props.onImport(strategy)}
    />
  );
}

function GalleryBackupExportOverlay(
  props: Pick<
    GalleryAppLayoutProps,
    'onBackupExportConfirm' | 'onBackupExportInspect' | 'onPendingExportClose' | 'state'
  >
) {
  if (!props.state.storage.pendingExport) {
    return null;
  }

  return (
    <BackupExportModal
      options={props.state.storage.pendingExport.options}
      summary={props.state.storage.pendingExport.summary}
      onClose={props.onPendingExportClose}
      onExport={async (options) => props.onBackupExportConfirm(options)}
      onInspect={props.onBackupExportInspect}
    />
  );
}

function GalleryConfirmOverlay(
  props: Pick<GalleryAppLayoutProps, 'onConfirmDialogClose' | 'state'>
) {
  if (!props.state.storage.confirmDialog) {
    return null;
  }

  return (
    <ProductConfirmDialog
      title={props.state.storage.confirmDialog.title}
      message={props.state.storage.confirmDialog.message}
      confirmText={props.state.storage.confirmDialog.confirmText}
      cancelText={props.state.storage.confirmDialog.cancelText}
      onCancel={props.onConfirmDialogClose}
      onConfirm={props.state.storage.confirmDialog.onConfirm}
    />
  );
}

type GalleryPreviewOverlayProps = Pick<
  GalleryAppLayoutProps,
  | 'onAddTag'
  | 'onFilenameChange'
  | 'onPreviewClose'
  | 'onPreviewInspectorToggle'
  | 'onPreviewCopy'
  | 'onPreviewDelete'
  | 'onPreviewDownload'
  | 'onPreviewEdit'
  | 'onPreviewOpenSnapshotScreenshot'
  | 'onPreviewResetChanges'
  | 'onRemoveTag'
  | 'onTagDraftChange'
  | 'state'
>;

function buildPreviewTagProps(props: GalleryPreviewOverlayProps) {
  return props.state.derived.allTags.length === 0 ? {} : { allTags: props.state.derived.allTags };
}

function buildPreviewResetProps(props: GalleryPreviewOverlayProps) {
  return props.onPreviewResetChanges === undefined
    ? {}
    : { onResetChanges: props.onPreviewResetChanges };
}

function renderPreviewOverlayPanel(
  props: GalleryPreviewOverlayProps,
  previewItem: NonNullable<GalleryPreviewOverlayProps['state']['preview']['session']['item']>
) {
  return (
    <PreviewPanel
      {...buildPreviewTagProps(props)}
      {...(props.state.preview.draft.hasChanges ? { hasChanges: true } : {})}
      item={previewItem}
      previewUrl={props.state.preview.session.url}
      inspectorCollapsed={props.state.preview.session.inspectorCollapsed}
      filenameDraft={props.state.preview.draft.filename}
      tagDraft={props.state.preview.draft.tagInput}
      tagDrafts={props.state.preview.draft.tags}
      onClose={props.onPreviewClose}
      onInspectorToggle={props.onPreviewInspectorToggle}
      onFilenameChange={props.onFilenameChange}
      onTagDraftChange={props.onTagDraftChange}
      onRemoveTag={props.onRemoveTag}
      onAddTag={props.onAddTag}
      {...buildPreviewResetProps(props)}
      onDownload={async () => props.onPreviewDownload()}
      onCopy={async () => props.onPreviewCopy()}
      onEdit={() => props.onPreviewEdit(previewItem)}
      onOpenSnapshotScreenshot={async () => props.onPreviewOpenSnapshotScreenshot()}
      onDelete={async () => props.onPreviewDelete(previewItem)}
    />
  );
}

function GalleryPreviewOverlay(props: GalleryPreviewOverlayProps) {
  const previewItem = props.state.preview.session.item;
  return previewItem ? renderPreviewOverlayPanel(props, previewItem) : null;
}

export function GalleryOverlays(props: GalleryAppLayoutProps) {
  return (
    <>
      <GalleryConfirmOverlay {...props} />
      <GalleryBackupExportOverlay {...props} />
      <GalleryStorageOverlay {...props} />
      <GalleryImportOverlay {...props} />
      <GalleryPreviewOverlay {...props} />
    </>
  );
}
