import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  isContentPrivilegedActionRequestSource,
  isContentPrivilegedActionType,
  isContentPrivilegedActionActivationProof,
  isContentPrivilegedActionActivationPurpose,
  type ContentPrivilegedActionActivationProof,
  type ContentPrivilegedActionActivationPurpose,
  type ContentPrivilegedActionRequestSource,
  type ContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';

type ContentPrivilegedActionActivationKeyRequest = {
  purpose: ContentPrivilegedActionActivationPurpose;
  type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY;
};

export type ContentPrivilegedActionCapabilityRequest = {
  actionType: ContentPrivilegedActionType;
  requestId: string;
  source: ContentPrivilegedActionRequestSource;
  type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY;
};

type ContentPrivilegedActionProofRequest = {
  actionType: ContentPrivilegedActionType;
  requestId: string;
  runtimeToken: string;
  type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF;
};

type ContentPrivilegedActionRuntimeTokenRequest = {
  activationProof: ContentPrivilegedActionActivationProof;
  actionType: ContentPrivilegedActionType;
  requestId: string;
  type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseContentPrivilegedActionActivationKeyRequest(
  message: unknown
): ContentPrivilegedActionActivationKeyRequest | null {
  if (
    !isRecord(message) ||
    message['type'] !== MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY ||
    !isContentPrivilegedActionActivationPurpose(message['purpose'])
  ) {
    return null;
  }

  return {
    purpose: message['purpose'],
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  };
}

export function parseContentPrivilegedActionProofRequest(
  message: unknown
): ContentPrivilegedActionProofRequest | null {
  if (
    !isRecord(message) ||
    message['type'] !== MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF ||
    !isContentPrivilegedActionType(message['actionType']) ||
    typeof message['requestId'] !== 'string' ||
    typeof message['runtimeToken'] !== 'string'
  ) {
    return null;
  }

  return {
    actionType: message['actionType'],
    requestId: message['requestId'],
    runtimeToken: message['runtimeToken'],
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
  };
}

export function parseContentPrivilegedActionRuntimeTokenRequest(
  message: unknown
): ContentPrivilegedActionRuntimeTokenRequest | null {
  if (
    !isRecord(message) ||
    message['type'] !== MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN ||
    !isContentPrivilegedActionActivationProof(message['activationProof']) ||
    !isContentPrivilegedActionType(message['actionType']) ||
    typeof message['requestId'] !== 'string'
  ) {
    return null;
  }

  return {
    activationProof: message['activationProof'],
    actionType: message['actionType'],
    requestId: message['requestId'],
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  };
}

export function parseContentPrivilegedActionCapabilityRequest(
  message: unknown
): ContentPrivilegedActionCapabilityRequest | null {
  if (
    !isRecord(message) ||
    message['type'] !== MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY ||
    !isContentPrivilegedActionType(message['actionType']) ||
    typeof message['requestId'] !== 'string' ||
    !isContentPrivilegedActionRequestSource(message['source'])
  ) {
    return null;
  }

  return {
    actionType: message['actionType'],
    requestId: message['requestId'],
    source: message['source'],
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
}
