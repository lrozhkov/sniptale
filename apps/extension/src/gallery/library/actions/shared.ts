import { writeBrowserClipboardItems } from '@sniptale/platform/browser/clipboard';
import { translate } from '../../../platform/i18n';
import type { GallerySurfaceController } from './controller-types';

export type GalleryBusyAction = (action: () => Promise<void>) => Promise<void>;

type GalleryConfirmDialogController = {
  actions: {
    surface: Pick<GallerySurfaceController['actions']['surface'], 'setConfirmDialog'>;
  };
};

export function openGalleryConfirmDialog(
  controller: GalleryConfirmDialogController,
  params: {
    message: string;
    onConfirm: () => Promise<void>;
    title?: string;
  }
): void {
  controller.actions.surface.setConfirmDialog({
    title: params.title ?? translate('common.actions.delete'),
    message: params.message,
    confirmText: translate('common.actions.delete'),
    cancelText: translate('common.actions.cancel'),
    onConfirm: async () => {
      await params.onConfirm();
      controller.actions.surface.setConfirmDialog(null);
    },
  });
}

export function createBusyActionRunner({ actions }: Pick<GallerySurfaceController, 'actions'>) {
  return async (action: () => Promise<void>) => {
    actions.surface.setIsBusy(true);
    try {
      await action();
    } catch (error) {
      actions.surface.setBanner(error instanceof Error ? error.message : String(error));
    } finally {
      actions.surface.setIsBusy(false);
    }
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyImageBlob(blob: Blob): Promise<void> {
  await writeBrowserClipboardItems([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
}

export function createMissingBlobError(filename: string): Error {
  return new Error(`${translate('gallery.app.missingBlobPrefix')} ${filename}.`);
}
