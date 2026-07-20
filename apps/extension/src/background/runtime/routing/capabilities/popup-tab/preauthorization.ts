const preauthorizedPopupTabRouteCapabilityRequestMessages = new WeakSet<object>();

export function markPreauthorizedPopupTabRouteCapabilityRequestMessage(message: object): void {
  preauthorizedPopupTabRouteCapabilityRequestMessages.add(message);
}

export function hasPreauthorizedPopupTabRouteCapabilityRequestMessage(message: object): boolean {
  return preauthorizedPopupTabRouteCapabilityRequestMessages.has(message);
}
