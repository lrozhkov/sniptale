import { createLogger } from '@sniptale/platform/observability/logger';
import { StaleTrashItemError } from '../../../composition/persistence/library-lifecycle/trash';
import {
  MediaAssetDeletionBlockedError,
  PrimaryMediaAssetDeleteError,
  StaleMediaAssetDeletePreviewError,
} from '../../../composition/persistence/media-library/deletion-errors';
import { MediaLibraryDeleteError } from '../../../composition/persistence/media-library/index.library';
import { isMediaHubStorageError } from '../../../features/media-hub/storage-errors';
import { writeBrowserClipboardItems } from '@sniptale/platform/browser/clipboard';
import { translate } from '../../../platform/i18n';
import { downloadGalleryBlob } from '../../shared/download';
import type { GallerySurfaceController } from './controller-types';

type GalleryActionContext = {
  stage: 'prepare-delete' | 'permanent-delete' | 'move-to-trash' | 'restore';
  materialType: 'media' | 'scenario-project' | 'video-project' | 'scenario-export' | 'mixed';
};
export type GalleryBusyAction = (
  action: () => Promise<void>,
  context?: GalleryActionContext
) => Promise<void>;
const logger = createLogger({ namespace: 'gallery:actions' });

class GalleryUserFacingActionError extends Error {}

export function createGalleryUserFacingActionError(message: string): Error {
  return new GalleryUserFacingActionError(message);
}

type GalleryConfirmDialogController = {
  actions: {
    surface: Pick<GallerySurfaceController['actions']['surface'], 'setConfirmDialog'>;
  };
};

export function openGalleryConfirmDialog(
  controller: GalleryConfirmDialogController,
  params: {
    cancelText?: string;
    confirmText?: string;
    message: string;
    onConfirm: () => Promise<void>;
    title?: string;
  }
): void {
  controller.actions.surface.setConfirmDialog({
    title: params.title ?? translate('common.actions.delete'),
    message: params.message,
    confirmText: params.confirmText ?? translate('common.actions.delete'),
    cancelText: params.cancelText ?? translate('common.actions.cancel'),
    onConfirm: async () => {
      await params.onConfirm();
      controller.actions.surface.setConfirmDialog(null);
    },
  });
}

export function createBusyActionRunner({ actions }: Pick<GallerySurfaceController, 'actions'>) {
  return async (action: () => Promise<void>, context?: GalleryActionContext) => {
    const releaseOperation = actions.surface.beginBlockingOperation();
    try {
      await action();
    } catch (error) {
      if (isUserCancellation(error)) return;
      const failure = describeActionFailure(error);
      logger.warn('gallery-action-failed', {
        code: failure.code,
        stage: context?.stage ?? 'gallery-action',
        materialType: context?.materialType ?? 'unspecified',
      });
      actions.surface.setBanner(failure.message);
    } finally {
      releaseOperation();
    }
  };
}

function describeActionFailure(error: unknown): { code: string; message: string } {
  if (error instanceof MediaLibraryDeleteError) error = error.cause;
  if (error instanceof MediaAssetDeletionBlockedError) {
    if (error.reason === 'invalid-graph' && error.graphDomain) {
      const messages = {
        'video-project': 'gallery.app.deleteInvalidVideoProject',
        'scenario-project': 'gallery.app.deleteInvalidScenarioProject',
        'scenario-asset': 'gallery.app.deleteInvalidScenarioAsset',
        'quick-edit': 'gallery.app.deleteInvalidQuickEdit',
      } as const;
      return {
        code: `invalid-graph:${error.graphDomain}`,
        message: translate(messages[error.graphDomain]),
      };
    }
    const messages = {
      'scenario-busy': 'gallery.app.deleteScenarioBusy',
      'invalid-graph': 'gallery.app.deleteInvalidGraph',
      'source-unavailable': 'gallery.app.deleteSourceUnavailable',
      'unsupported-source': 'gallery.app.deleteUnsupportedSource',
      'pending-publication': 'gallery.app.deletePendingPublication',
    } as const;
    return { code: error.reason, message: translate(messages[error.reason]) };
  }
  if (error instanceof GalleryUserFacingActionError)
    return { code: 'user-facing', message: error.message };
  if (error instanceof StaleTrashItemError)
    return { code: 'item-state-changed', message: translate('gallery.app.deleteStateChanged') };
  if (error instanceof StaleMediaAssetDeletePreviewError)
    return {
      code: 'references-changed',
      message: translate('gallery.app.deleteReferencesChanged'),
    };
  if (error instanceof PrimaryMediaAssetDeleteError)
    return {
      code: 'primary-source-required',
      message: translate('gallery.app.deleteRequiredSource'),
    };
  if (isMediaHubStorageError(error))
    return { code: `storage-${error.kind}`, message: error.message };
  return { code: 'unexpected', message: translate('gallery.app.actionFailed') };
}

function isUserCancellation(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export const downloadBlob = downloadGalleryBlob;

export async function copyImageBlob(blob: Blob): Promise<void> {
  await writeBrowserClipboardItems([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
}

export function createMissingBlobError(filename: string): Error {
  return new GalleryUserFacingActionError(
    `${translate('gallery.app.missingBlobPrefix')} ${filename}.`
  );
}
