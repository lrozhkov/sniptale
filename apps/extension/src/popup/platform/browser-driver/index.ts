/** Removes consumed recording launch parameters without changing another popup address. */
export function clearPopupVideoLaunchUrlParams(expectedHref: string): void {
  if (window.location.href !== expectedHref) return;
  const url = new URL(expectedHref);
  url.searchParams.delete('videoLaunchMode');
  url.searchParams.delete('videoLaunchTabId');
  url.searchParams.delete('videoLaunchPresetId');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
