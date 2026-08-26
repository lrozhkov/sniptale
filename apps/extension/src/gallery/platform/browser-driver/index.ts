/** Owns browser-history mutation for the Gallery's one-shot recording preview route. */
export function clearGalleryRecordingPreviewUrlParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('recordingId');
  url.searchParams.delete('folder');
  url.searchParams.delete('scope');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
