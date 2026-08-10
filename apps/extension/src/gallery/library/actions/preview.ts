import { browserTabs } from '@sniptale/platform/browser/tabs';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library.ts';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import {
  openScenarioEditorPage,
  openVideoEditorPage,
  openWebSnapshotViewerPage,
} from '../../../platform/navigation/extension-pages/index';
import { updateScenarioProjectRecordMetadata } from '../../../composition/persistence/scenario/store/public';
import type { GalleryPreviewController } from './controller-types';
import {
  isGalleryMediaItem,
  isGalleryScenarioItem,
  isGalleryVideoProjectAvailable,
  isGalleryVideoProjectItem,
  type GalleryItem,
} from '../items';
import { isImageKind } from '../ui';
import {
  copyImageBlob,
  createMissingBlobError,
  downloadBlob,
  type GalleryBusyAction,
} from './shared';
import { updateMediaLibraryEntrySafely } from '../../../workflows/media-hub/store';
import { getAggregatePreviewBlob } from '../../../composition/persistence/aggregate-presentations';
import {
  copyImageAggregate,
  restoreImageAggregateOriginal,
} from '../../../composition/persistence/image-aggregates';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { translate } from '../../../platform/i18n';
import { openGalleryConfirmDialog } from './shared';

type PreviewMediaMetadataPatch = Partial<Pick<MediaLibraryEntry, 'filename' | 'tags'>>;

export function openInEditor(item: GalleryItem) {
  if (isGalleryScenarioItem(item)) {
    void openScenarioEditorPage(item.entityId);
    return;
  }

  if (isGalleryVideoProjectItem(item)) {
    if (!isGalleryVideoProjectAvailable(item)) return;
    void openVideoEditorPage(item.entityId, null);
    return;
  }

  if (!isGalleryMediaItem(item) || !isImageKind(item.kind)) {
    if (isGalleryMediaItem(item) && item.kind === 'web-archive') {
      void openWebSnapshotViewerPage(item.entityId ?? item.id);
    }
    return;
  }

  void browserTabs.create({
    url: buildEditorUrl({
      assetId: item.entityId ?? item.id,
    }),
  });
}

function resetPreview(controller: GalleryPreviewController) {
  controller.actions.preview.setPreview({ inspectorCollapsed: false, item: null, url: null });
}

async function withPreviewItemBlob(
  controller: GalleryPreviewController,
  withBusy: GalleryBusyAction,
  effect: (item: GalleryItem, blob: Blob) => Promise<void> | void
): Promise<void> {
  const previewItem = controller.state.preview.session.item;
  if (!previewItem || !isGalleryMediaItem(previewItem)) {
    return;
  }

  await withBusy(async () => {
    const assetId = previewItem.entityId ?? previewItem.id;
    const blob =
      previewItem.kind === 'image' || previewItem.kind === 'screenshot'
        ? await getAggregatePreviewBlob({ id: assetId, kind: 'image' })
        : await getMediaAssetBlob(assetId);
    if (!blob) {
      throw createMissingBlobError(previewItem.filename);
    }

    await effect(previewItem, blob);
  });
}

export function downloadPreviewItem(
  controller: GalleryPreviewController,
  withBusy: GalleryBusyAction
): Promise<void> {
  return withPreviewItemBlob(controller, withBusy, (item, blob) => {
    downloadBlob(blob, item.filename);
  });
}

function getPreviewImageAggregate(controller: GalleryPreviewController) {
  const item = controller.state.preview.session.item;
  return item &&
    isGalleryMediaItem(item) &&
    isImageKind(item.kind) &&
    item.source.kind === 'screenshot'
    ? item
    : null;
}

export function downloadOriginalPreviewItem(
  controller: GalleryPreviewController,
  withBusy: GalleryBusyAction
): Promise<void> {
  const item = getPreviewImageAggregate(controller);
  if (!item) return Promise.resolve();
  return withBusy(async () => {
    const blob = await getMediaAssetBlob(item.entityId ?? item.id);
    if (!blob) throw createMissingBlobError(item.originalFilename ?? item.filename);
    downloadBlob(blob, item.originalFilename ?? item.filename);
  });
}

export function createRestoreOriginalAction(
  controller: GalleryPreviewController,
  withBusy: GalleryBusyAction
) {
  return () => {
    const item = getPreviewImageAggregate(controller);
    if (!item) return;
    openGalleryConfirmDialog(controller, {
      title: translate('gallery.preview.restoreOriginalTitle'),
      message: translate('gallery.preview.restoreOriginalMessage'),
      confirmText: translate('gallery.preview.restoreOriginalConfirm'),
      onConfirm: async () => {
        await withBusy(async () => {
          const result = await restoreImageAggregateOriginal(
            item.entityId ?? item.id,
            item.workspaceRevision ?? 0
          );
          controller.actions.preview.setPreview((current) => ({
            ...current,
            item: current.item
              ? {
                  ...current.item,
                  presentationRevision: result.revision,
                  updatedAt: result.updatedAt,
                  workspaceRevision: result.revision,
                }
              : null,
            url: null,
          }));
          await controller.actions.storage.refresh();
        });
      },
    });
  };
}

export function createSaveImageCopyAction(
  controller: GalleryPreviewController,
  withBusy: GalleryBusyAction
) {
  return () => {
    const item = getPreviewImageAggregate(controller);
    if (!item) return Promise.resolve();
    return withBusy(async () => {
      await copyImageAggregate({
        aggregateId: item.entityId ?? item.id,
        expectedWorkspaceRevision: item.workspaceRevision ?? 0,
        targetAggregateId: createSecureRandomUuid(),
      });
      await controller.actions.storage.refresh();
    });
  };
}

export function copyPreviewItem(
  controller: GalleryPreviewController,
  withBusy: GalleryBusyAction
): Promise<void> {
  const previewItem = controller.state.preview.session.item;
  if (!previewItem || !isGalleryMediaItem(previewItem) || !isImageKind(previewItem.kind)) {
    return Promise.resolve();
  }

  return withPreviewItemBlob(controller, withBusy, (_item, blob) => copyImageBlob(blob));
}

function areTagsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function buildPreviewMediaMetadataPatch(
  previewItem: GalleryItem,
  filename: string,
  tags: string[]
): PreviewMediaMetadataPatch {
  const patch: PreviewMediaMetadataPatch = {};
  if (filename !== previewItem.filename) {
    patch.filename = filename;
  }
  if (!areTagsEqual(tags, previewItem.tags)) {
    patch.tags = tags;
  }
  return patch;
}

async function persistPreviewMetadata(controller: GalleryPreviewController): Promise<void> {
  const previewItem = controller.state.preview.session.item;
  if (!previewItem || !controller.state.preview.draft.hasChanges) {
    return;
  }

  const nextFilename = controller.state.preview.draft.filename.trim() || previewItem.filename;
  const nextTags = controller.state.preview.draft.tags;

  if (isGalleryMediaItem(previewItem)) {
    const patch = buildPreviewMediaMetadataPatch(previewItem, nextFilename, nextTags);
    if (Object.keys(patch).length > 0) {
      await updateMediaLibraryEntrySafely(previewItem.entityId ?? previewItem.id, patch);
    }
    return;
  }

  if (isGalleryScenarioItem(previewItem)) {
    await updateScenarioProjectRecordMetadata(previewItem.entityId, {
      name: nextFilename,
      tags: nextTags,
    });
  }
}

export function createSaveMetadataAction(controller: GalleryPreviewController) {
  return async (withBusy: GalleryBusyAction) => {
    const previewItem = controller.state.preview.session.item;
    if (!previewItem) {
      return;
    }

    await withBusy(async () => {
      await persistPreviewMetadata(controller);
      await controller.actions.storage.refresh();
    });
  };
}

export function createClosePreviewAction(controller: GalleryPreviewController) {
  return async (withBusy: GalleryBusyAction) => {
    const previewItem = controller.state.preview.session.item;
    if (!previewItem) {
      resetPreview(controller);
      return;
    }

    await withBusy(async () => {
      await persistPreviewMetadata(controller);
      resetPreview(controller);
      await controller.actions.storage.refresh();
    });
  };
}

export function resetPreviewChanges(controller: GalleryPreviewController) {
  const previewItem = controller.state.preview.session.item;
  if (!previewItem) {
    return;
  }

  controller.actions.preview.setFilenameDraft(previewItem.filename);
  controller.actions.preview.setTagDraft('');
  controller.actions.preview.setTagDrafts(previewItem.tags);
}
