import { writeBrowserClipboardItems } from '@sniptale/platform/browser/clipboard';
import { translate } from '../../../platform/i18n';
import { downloadGalleryBlob } from '../../shared/download';
import type { GallerySurfaceController } from './controller-types';

export type GalleryBusyAction = (action: () => Promise<void>) => Promise<void>;

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
  return async (action: () => Promise<void>) => {
    const releaseOperation = actions.surface.beginBlockingOperation();
    try {
      await action();
    } catch (error) {
      if (isUserCancellation(error)) return;
      actions.surface.setBanner(
        error instanceof GalleryUserFacingActionError
          ? error.message
          : translate('gallery.app.actionFailed')
      );
    } finally {
      releaseOperation();
    }
  };
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
