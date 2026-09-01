import type { PreauthorizedContentActionBinding } from '../../../routing-contracts/capabilities/content-action/route';

export type ContentSenderBinding = PreauthorizedContentActionBinding;

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
