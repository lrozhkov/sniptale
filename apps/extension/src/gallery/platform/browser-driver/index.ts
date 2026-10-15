/** Owns browser-history mutation for the Gallery's one-shot recording preview route. */
export function clearGalleryRecordingPreviewUrlParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('recordingId');
  url.searchParams.delete('mediaId');
  url.searchParams.delete('mode');
  url.searchParams.delete('folder');
  url.searchParams.delete('scope');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Keeps the mounted quick editor address reusable across reload and tab restoration. */
export function setGalleryQuickEditUrl(aggregateId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('recordingId');
  url.searchParams.set('mediaId', aggregateId);
  url.searchParams.set('mode', 'edit');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/** A departing editor cannot clear a newer editor's address. */
export function clearGalleryQuickEditUrl(aggregateId: string): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get('mediaId') !== aggregateId || url.searchParams.get('mode') !== 'edit')
    return;
  url.searchParams.delete('mediaId');
  url.searchParams.delete('mode');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
