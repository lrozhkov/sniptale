// policyStateIds: [] - authority value builders are pure and own no capability state.
import type { ContentPrivilegedActionType } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { createPolicySenderBinding } from '../policy/sender-binding';

export type ContentSenderBinding = {
  documentId: string;
  frameId: number;
  senderUrl: string;
  tabId: number;
};

export type ContentActionCapabilityPayload = {
  actionType: ContentPrivilegedActionType;
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
  requestId: string;
}): ContentActionCapabilityPayload {
  return {
    actionType: args.actionType,
    requestId: args.requestId,
  };
}
