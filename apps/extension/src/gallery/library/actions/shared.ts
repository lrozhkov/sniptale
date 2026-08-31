import { writeBrowserClipboardItems } from '@sniptale/platform/browser/clipboard';
import { browserDownloads } from '@sniptale/platform/browser/downloads';
import { translate } from '../../../platform/i18n';
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

export function downloadBlob(
  blob: Blob,
  filename: string,
  release?: () => void | Promise<void>,
  onReleaseError?: (error: unknown) => void
): void {
  const url = URL.createObjectURL(blob);
  trackBlobDownloadCleanup(url, release, onReleaseError);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
}

function trackBlobDownloadCleanup(
  url: string,
  release?: () => void | Promise<void>,
  onReleaseError?: (error: unknown) => void
): void {
  const tracksTerminalState = browserDownloads.isAvailable();
  let settled = false;
  let timeoutId: number | null = null;
  let unsubscribeCreated: () => void = () => undefined;
  let unsubscribeChanged: () => void = () => undefined;
  const cleanup = () => {
    if (settled) return;
    settled = true;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    unsubscribeCreated();
    unsubscribeChanged();
    URL.revokeObjectURL(url);
    if (release)
      void Promise.resolve()
        .then(release)
        .catch((error: unknown) => onReleaseError?.(error));
  };
  timeoutId = window.setTimeout(cleanup, tracksTerminalState ? 24 * 60 * 60 * 1000 : 1000);
  if (!tracksTerminalState) return;

  unsubscribeCreated = browserDownloads.subscribeToCreated((item) => {
    if (item.url !== url && item.finalUrl !== url) return;
    unsubscribeCreated();
    unsubscribeCreated = () => undefined;
    unsubscribeChanged = browserDownloads.subscribeToChanged((delta) => {
      if (delta.id !== item.id) return;
      const state = delta.state?.current;
      if (state === 'complete' || state === 'interrupted') cleanup();
    });
    void browserDownloads
      .search({ id: item.id })
      .then(([current]) => {
        if (current?.state === 'complete' || current?.state === 'interrupted') cleanup();
      })
      .catch(() => undefined);
  });
}

export async function copyImageBlob(blob: Blob): Promise<void> {
  await writeBrowserClipboardItems([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
}

export function createMissingBlobError(filename: string): Error {
  return new GalleryUserFacingActionError(
    `${translate('gallery.app.missingBlobPrefix')} ${filename}.`
  );
}
