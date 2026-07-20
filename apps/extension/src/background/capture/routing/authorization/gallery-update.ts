const preauthorizedGalleryUpdateMessages = new WeakSet<object>();

export function markPreauthorizedGalleryUpdateRouteMessage(message: object): void {
  preauthorizedGalleryUpdateMessages.add(message);
}

export function hasPreauthorizedGalleryUpdateRouteMessage(message: object): boolean {
  return preauthorizedGalleryUpdateMessages.has(message);
}
