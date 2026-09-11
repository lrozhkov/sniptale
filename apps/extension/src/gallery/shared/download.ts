import { browserDownloads } from '@sniptale/platform/browser/downloads';

export function downloadGalleryBlob(
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
