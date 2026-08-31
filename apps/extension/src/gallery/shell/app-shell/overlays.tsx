import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { BackupExportModalContent } from '../../library/modals/backup-export-content';
import { ImportConflictModalContent } from '../../library/modals/import-conflict-content';
import { MediaImportConflictModalContent } from '../../library/modals/media-import-conflict-content';
import { WebSnapshotImportModalContent } from '../../library/modals/web-snapshot-import-content';
import { PreviewPanel } from '../../library/preview';
import { isGalleryMediaItem } from '../../library/items';
import type { GalleryAppLayoutProps } from './types';

const galleryConfirmDialogClassName = [
  '!w-[min(400px,calc(100vw-32px))] !max-w-none !rounded-[12px]',
  '!bg-[var(--sniptale-color-surface-panel)] !p-0 !font-[inherit]',
  '[&_.sniptale-modal-header-sm]:!border-b-0 [&_.sniptale-modal-header-sm]:!bg-transparent',
  '[&_.sniptale-modal-header-sm]:!px-4 [&_.sniptale-modal-header-sm]:!pb-1 [&_.sniptale-modal-header-sm]:!pt-4',
  '[&_.sniptale-confirm-title]:!m-0',
  '[&_.sniptale-modal-body-sm]:!gap-0 [&_.sniptale-modal-body-sm]:!bg-transparent',
  '[&_.sniptale-modal-body-sm]:!px-4 [&_.sniptale-modal-body-sm]:!py-2',
  '[&_.sniptale-confirm-message]:!m-0 [&_.sniptale-confirm-message]:!text-[var(--sniptale-color-text-secondary)]',
  '[&_.sniptale-modal-footer-sm]:!gap-2 [&_.sniptale-modal-footer-sm]:!border-t-0',
  '[&_.sniptale-modal-footer-sm]:!bg-transparent [&_.sniptale-modal-footer-sm]:!px-4',
  '[&_.sniptale-modal-footer-sm]:!pb-4 [&_.sniptale-modal-footer-sm]:!pt-3',
  '[&_.sniptale-modal-footer-sm_button]:!h-9 [&_.sniptale-modal-footer-sm_button]:!min-h-9',
  '[&_.sniptale-modal-footer-sm_button]:!rounded-[8px] [&_.sniptale-modal-footer-sm_button]:!px-3.5',
].join(' ');

function GalleryImportOverlay(
  props: Pick<GalleryAppLayoutProps, 'onImport' | 'onPendingImportClose' | 'state'>
) {
  if (!props.state.storage.pendingImport) {
    return null;
  }

  return (
    <ImportConflictModalContent
      {...(props.state.storage.pendingImport.resumeStrategy
        ? { fixedStrategy: props.state.storage.pendingImport.resumeStrategy }
        : {})}
      summary={props.state.storage.pendingImport.summary}
      onClose={props.onPendingImportClose}
      onImport={async (strategy) => props.onImport(strategy)}
    />
  );
}

function GalleryMediaImportOverlay(
  props: Pick<GalleryAppLayoutProps, 'onMediaImportConfirm' | 'onPendingMediaImportClose' | 'state'>
) {
  const pending = props.state.storage.pendingMediaImport;
  if (!pending) return null;

  return (
    <MediaImportConflictModalContent
      conflicts={pending.conflicts}
      fileCount={pending.files.length}
      onClose={props.onPendingMediaImportClose}
      onImport={props.onMediaImportConfirm}
    />
  );
}

function GalleryWebSnapshotImportOverlay(
  props: Pick<
    GalleryAppLayoutProps,
    'onPendingWebSnapshotImportClose' | 'onWebSnapshotImportConfirm' | 'state'
  >
) {
  const pending = props.state.storage.pendingWebSnapshotImport;
  if (!pending) return null;
  return (
    <WebSnapshotImportModalContent
      pending={pending}
      onClose={props.onPendingWebSnapshotImportClose ?? (() => undefined)}
      onImport={props.onWebSnapshotImportConfirm ?? (async () => undefined)}
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
    <BackupExportModalContent
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
      dialogClassName={galleryConfirmDialogClassName}
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
  | 'onPreviewNavigate'
  | 'onPreviewCopy'
  | 'onPreviewDelete'
  | 'onPreviewDownload'
  | 'onPreviewDownloadOriginal'
  | 'onPreviewEdit'
  | 'onPreviewOpenSnapshotScreenshot'
  | 'onPreviewPromote'
  | 'onPreviewResetChanges'
  | 'onPreviewRestoreOriginal'
  | 'onPreviewSaveCopy'
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

function buildPreviewNavigationProps(
  props: GalleryPreviewOverlayProps,
  previewItem: NonNullable<GalleryPreviewOverlayProps['state']['preview']['session']['item']>
) {
  if (!isGalleryMediaItem(previewItem)) {
    return {};
  }

  const items = props.state.derived.filteredItems.filter(isGalleryMediaItem);
  const index = items.findIndex((item) => item.id === previewItem.id);
  if (index < 0 || items.length < 2) {
    return {};
  }

  const previousItem = items[index - 1] ?? null;
  const nextItem = items[index + 1] ?? null;
  return {
    navigation: {
      current: index + 1,
      total: items.length,
      hasPrevious: previousItem !== null,
      hasNext: nextItem !== null,
      onPrevious: () => {
        if (previousItem) props.onPreviewNavigate(previousItem);
      },
      onNext: () => {
        if (nextItem) props.onPreviewNavigate(nextItem);
      },
    },
  };
}

function renderPreviewOverlayPanel(
  props: GalleryPreviewOverlayProps,
  previewItem: NonNullable<GalleryPreviewOverlayProps['state']['preview']['session']['item']>
) {
  return (
    <PreviewPanel
      {...buildPreviewTagProps(props)}
      {...(props.state.preview.draft.hasChanges ? { hasChanges: true } : {})}
      {...buildPreviewNavigationProps(props, previewItem)}
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
      onDownloadOriginal={async () => props.onPreviewDownloadOriginal()}
      onCopy={async () => props.onPreviewCopy()}
      onEdit={() => props.onPreviewEdit(previewItem)}
      onOpenSnapshotScreenshot={async () => props.onPreviewOpenSnapshotScreenshot()}
      onDelete={async () => props.onPreviewDelete(previewItem)}
      onRestoreOriginal={props.onPreviewRestoreOriginal}
      onSaveCopy={async () => props.onPreviewSaveCopy()}
      {...(props.onPreviewPromote
        ? { onPromote: async () => props.onPreviewPromote?.(previewItem) }
        : {})}
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
      <GalleryImportOverlay {...props} />
      <GalleryMediaImportOverlay {...props} />
      <GalleryWebSnapshotImportOverlay {...props} />
      <GalleryPreviewOverlay {...props} />
    </>
  );
}
