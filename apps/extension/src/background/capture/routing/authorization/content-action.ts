export type ContentSenderBinding = {
  readonly documentId: string;
  readonly frameId: number;
  readonly senderUrl: string;
  readonly tabId: number;
};

const preauthorizedContentActionRouteMessages = new WeakMap<object, ContentSenderBinding>();

export function markPreauthorizedContentActionRouteMessage(
  message: object,
  senderBinding: ContentSenderBinding
): void {
  preauthorizedContentActionRouteMessages.set(message, senderBinding);
}

export function getPreauthorizedContentActionRouteMessage(
  message: object
): ContentSenderBinding | undefined {
  return preauthorizedContentActionRouteMessages.get(message);
}
