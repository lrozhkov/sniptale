export function isContentRuntimeShimDocument(location: Pick<Location, 'protocol'>): boolean {
  return location.protocol !== 'chrome-extension:' && location.protocol !== 'moz-extension:';
}
