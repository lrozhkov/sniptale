import type { MessageType as RuntimeMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  isContentPrivilegedActionActivationKey,
  isContentPrivilegedActionCapability,
  isContentPrivilegedActionRuntimeToken,
  isContentPrivilegedActionTrustedEventProof,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { sendContentRuntimeShimMessage } from '@sniptale/platform/ports/runtime-messaging/content-runtime-shim';

export type ShimTransportDeps = {
  requestId?: () => string;
  sendRuntimeMessage?: (message: Record<string, unknown>) => Promise<unknown>;
};

type ShimTransportRuntimeDeps = {
  requestId: () => string;
  sendRuntimeMessage: (message: Record<string, unknown>) => Promise<unknown>;
};

function createDefaultRequestId(): string {
  return createSecureRandomUuid('Content runtime shim request id generation is unavailable.');
}

export function resolveShimTransportDeps(deps: ShimTransportDeps = {}): ShimTransportRuntimeDeps {
  return {
    requestId: deps.requestId ?? createDefaultRequestId,
    sendRuntimeMessage: deps.sendRuntimeMessage ?? sendContentRuntimeShimMessage,
  };
}

function isSuccessRecord(value: unknown): value is Record<string, unknown> & { success: true } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { success?: unknown }).success === true
  );
}

function getResponseError(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null && 'error' in value) {
    const error = value.error;
    return typeof error === 'string' ? error : fallback;
  }

  return fallback;
}

export function requireShimSuccess(response: unknown, fallback: string): Record<string, unknown> {
  if (!isSuccessRecord(response)) {
    throw new Error(getResponseError(response, fallback));
  }

  return response;
}

type ShimContentActionType = 'TRIGGER_QUICK_ACTION' | 'ENABLE_SCREENSHOT_MODE';
const MESSAGE_TYPE = {
  REQUEST_ACTIVATION_KEY:
    'REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY' satisfies RuntimeMessageType,
  REQUEST_CAPABILITY: 'REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY' satisfies RuntimeMessageType,
  REQUEST_PROOF: 'REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF' satisfies RuntimeMessageType,
  REQUEST_RUNTIME_TOKEN:
    'REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN' satisfies RuntimeMessageType,
} as const;

async function requestActivationKey(deps: ShimTransportRuntimeDeps) {
  const response = requireShimSuccess(
    await deps.sendRuntimeMessage({
      purpose: 'trusted-content-event',
      type: MESSAGE_TYPE.REQUEST_ACTIVATION_KEY,
    }),
    'Content action activation key request failed'
  );
  const activationKey = response['activationKey'];
  if (!isContentPrivilegedActionActivationKey(activationKey)) {
    throw new Error('Content action activation key request failed');
  }

  return activationKey;
}

async function requestRuntimeToken(
  deps: ShimTransportRuntimeDeps,
  actionType: ShimContentActionType,
  requestId: string,
  activationKey: unknown
): Promise<string> {
  const response = requireShimSuccess(
    await deps.sendRuntimeMessage({
      actionType,
      activationProof: activationKey,
      requestId,
      type: MESSAGE_TYPE.REQUEST_RUNTIME_TOKEN,
    }),
    'Content action runtime token request failed'
  );
  const runtimeToken = response['runtimeToken'];
  if (!isContentPrivilegedActionRuntimeToken(runtimeToken)) {
    throw new Error('Content action runtime token request failed');
  }

  return runtimeToken.runtimeToken;
}

async function requestTrustedEventProof(
  deps: ShimTransportRuntimeDeps,
  actionType: ShimContentActionType,
  requestId: string,
  runtimeToken: string
): Promise<string> {
  const response = requireShimSuccess(
    await deps.sendRuntimeMessage({
      actionType,
      requestId,
      runtimeToken,
      type: MESSAGE_TYPE.REQUEST_PROOF,
    }),
    'Content action trusted-event proof request failed'
  );
  const trustedEventProof = response['trustedEventProof'];
  if (!isContentPrivilegedActionTrustedEventProof(trustedEventProof)) {
    throw new Error('Content action trusted-event proof request failed');
  }

  return trustedEventProof.proofToken;
}

export async function requestShimContentIntent(
  deps: ShimTransportRuntimeDeps,
  actionType: ShimContentActionType,
  requestId: string
) {
  const runtimeToken = await requestRuntimeToken(
    deps,
    actionType,
    requestId,
    await requestActivationKey(deps)
  );
  const proofToken = await requestTrustedEventProof(deps, actionType, requestId, runtimeToken);
  const response = requireShimSuccess(
    await deps.sendRuntimeMessage({
      actionType,
      requestId,
      source: {
        kind: 'trusted-content-event-proof',
        proofToken,
      },
      type: MESSAGE_TYPE.REQUEST_CAPABILITY,
    }),
    'Content action capability request failed'
  );
  const contentIntent = response['contentIntent'];
  if (!isContentPrivilegedActionCapability(contentIntent)) {
    throw new Error('Content action capability request failed');
  }

  return contentIntent;
}
