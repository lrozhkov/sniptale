import { browserDownloads } from '@sniptale/platform/browser/downloads';

/** Browser terminal feedback is independent of backing-file release; fallback never claims completion. */
export function downloadGalleryBlob(
  blob: Blob,
  filename: string,
  release?: () => void | Promise<void>,
  onReleaseError?: (error: unknown) => void,
  onState?: (state: 'complete' | 'interrupted' | 'unconfirmed') => void
): void {
  const url = URL.createObjectURL(blob);
  const cleanup = trackBlobDownloadCleanup(url, release, onReleaseError, onState);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } catch (error) {
    cleanup('interrupted');
    throw error;
  }
}

function trackBlobDownloadCleanup(
  url: string,
  release?: () => void | Promise<void>,
  onReleaseError?: (error: unknown) => void,
  onState?: (state: 'complete' | 'interrupted' | 'unconfirmed') => void
) {
  const tracksTerminalState = browserDownloads.isAvailable();
  let settled = false;
  let timeoutId: number | null = null;
  let unsubscribeCreated: () => void = () => undefined;
  let unsubscribeChanged: () => void = () => undefined;
  const cleanup = (state: 'complete' | 'interrupted' | 'unconfirmed') => {
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
    onState?.(state);
  };
  timeoutId = window.setTimeout(
    () => cleanup('unconfirmed'),
    tracksTerminalState ? 24 * 60 * 60 * 1000 : 1000
  );
  if (!tracksTerminalState) return cleanup;

  unsubscribeCreated = browserDownloads.subscribeToCreated((item) => {
    if (item.url !== url && item.finalUrl !== url) return;
    unsubscribeCreated();
    unsubscribeCreated = () => undefined;
    unsubscribeChanged = browserDownloads.subscribeToChanged((delta) => {
      if (delta.id !== item.id) return;
      const state = delta.state?.current;
      if (state === 'complete' || state === 'interrupted') cleanup(state);
    });
    void browserDownloads
      .search({ id: item.id })
      .then(([current]) => {
        if (current?.state === 'complete' || current?.state === 'interrupted')
          cleanup(current.state);
      })
      .catch(() => undefined);
  });
  return cleanup;
}
