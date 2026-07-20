import { browserTabs } from '@sniptale/platform/browser/tabs';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library.ts';
import type { MediaLibraryEntry } from '../../../composition/persistence/media-library/contracts';
import { createSecureRandomUuid as createEditorSessionId } from '@sniptale/platform/security/secure-random-id';
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
      sessionId: createEditorSessionId(),
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
    const blob = await getMediaAssetBlob(previewItem.entityId ?? previewItem.id);
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
