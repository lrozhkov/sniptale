// policyStateIds: [] - authority value builders are pure and own no capability state.
import type { ContentPrivilegedActionType } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { createPolicySenderBinding } from '../policy/sender-binding';

export type ContentSenderBinding = {
  documentId: string;
  frameId: number;
  senderUrl: string;
  tabId: number;
  libraryDestinationAuthorized?: true;
};

export type ContentActionCapabilityPayload = {
  actionType: ContentPrivilegedActionType;
  libraryDestinationAuthorized?: boolean;
  requestId: string;
};

export function createContentCapabilityToken(): string {
  return crypto.randomUUID();
}

export function createContentPolicySenderBinding(senderBinding: ContentSenderBinding) {
  return createPolicySenderBinding({
    documentId: senderBinding.documentId,
    frameId: senderBinding.frameId,
    senderUrl: senderBinding.senderUrl,
    tabId: senderBinding.tabId,
  });
}

export function createContentActionCapabilityPayload(args: {
  actionType: ContentPrivilegedActionType;
  libraryDestinationAuthorized?: boolean;
  requestId: string;
}): ContentActionCapabilityPayload {
  return {
    actionType: args.actionType,
    ...(args.libraryDestinationAuthorized ? { libraryDestinationAuthorized: true } : {}),
    requestId: args.requestId,
  };
}
