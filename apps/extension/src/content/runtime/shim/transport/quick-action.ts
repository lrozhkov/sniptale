import type { MessageType as RuntimeMessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  isContentPrivilegedActionActivationKey,
  isContentPrivilegedActionCapability,
  isContentPrivilegedActionRuntimeToken,
  isContentPrivilegedActionTrustedEventProof,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { QuickActionHotkeyAction } from '../../../platform/quick-action-hotkeys';
import {
  requireShimSuccess,
  resolveShimTransportDeps,
  type ShimTransportDeps,
  type ShimTransportRuntimeDeps,
} from './shared';

const MESSAGE_TYPE = {
  REQUEST_ACTIVATION_KEY:
    'REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY' satisfies RuntimeMessageType,
  REQUEST_CAPABILITY: 'REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY' satisfies RuntimeMessageType,
  REQUEST_PROOF: 'REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF' satisfies RuntimeMessageType,
  REQUEST_RUNTIME_TOKEN:
    'REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN' satisfies RuntimeMessageType,
  TRIGGER_QUICK_ACTION: 'TRIGGER_QUICK_ACTION' satisfies RuntimeMessageType,
} as const;

const QUICK_ACTION_TYPE = MESSAGE_TYPE.TRIGGER_QUICK_ACTION;

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
  requestId: string,
  activationKey: unknown
): Promise<string> {
  const response = requireShimSuccess(
    await deps.sendRuntimeMessage({
      actionType: QUICK_ACTION_TYPE,
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
  requestId: string,
  runtimeToken: string
): Promise<string> {
  const response = requireShimSuccess(
    await deps.sendRuntimeMessage({
      actionType: QUICK_ACTION_TYPE,
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

async function requestContentIntent(deps: ShimTransportRuntimeDeps, requestId: string) {
  const runtimeToken = await requestRuntimeToken(deps, requestId, await requestActivationKey(deps));
  const proofToken = await requestTrustedEventProof(deps, requestId, runtimeToken);
  const response = requireShimSuccess(
    await deps.sendRuntimeMessage({
      actionType: QUICK_ACTION_TYPE,
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

export async function triggerQuickActionFromShim(
  action: QuickActionHotkeyAction,
  deps?: ShimTransportDeps
): Promise<void> {
  const resolvedDeps = resolveShimTransportDeps(deps);
  const requestId = resolvedDeps.requestId();
  const contentIntent = await requestContentIntent(resolvedDeps, requestId);

  requireShimSuccess(
    await resolvedDeps.sendRuntimeMessage({
      actionId: action.id,
      contentIntent,
      type: MESSAGE_TYPE.TRIGGER_QUICK_ACTION,
    }),
    'Quick action hotkey trigger failed'
  );
}
