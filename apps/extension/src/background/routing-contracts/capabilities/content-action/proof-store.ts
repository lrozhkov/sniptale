import type {
  ContentPrivilegedActionRequestSource,
  ContentPrivilegedActionRuntimeToken,
  ContentPrivilegedActionTrustedEventProof,
  ContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { createPrivilegedCapabilityStore } from '../privileged-authority/state';
import {
  issuePolicyCapability,
  pruneExpiredPolicyCapabilities,
  type PolicyCapabilityRecord,
} from '../policy/capability-store';
import { consumeOneShotPolicyCapability } from '../policy/one-shot';
import {
  createContentActionCapabilityPayload,
  createContentCapabilityToken,
  createContentPolicySenderBinding,
  type ContentActionCapabilityPayload,
  type ContentSenderBinding,
} from './authority-shape';

const CONTENT_ACTION_RUNTIME_TOKENS_POLICY_ID = 'content-action-runtime-tokens';
const CONTENT_ACTION_TRUSTED_EVENT_PROOFS_POLICY_ID = 'content-action-trusted-event-proofs';

const contentPrivilegedActionTrustedEventProofs = createPrivilegedCapabilityStore<
  PolicyCapabilityRecord<ContentActionCapabilityPayload>
>({
  domain: 'background.privileged.content-action-trusted-event-proofs',
  policyId: CONTENT_ACTION_TRUSTED_EVENT_PROOFS_POLICY_ID,
  storageClass: 'memory-only',
});
const contentPrivilegedActionRuntimeTokens = createPrivilegedCapabilityStore<
  PolicyCapabilityRecord<ContentActionCapabilityPayload>
>({
  domain: 'background.privileged.content-action-runtime-tokens',
  policyId: CONTENT_ACTION_RUNTIME_TOKENS_POLICY_ID,
  storageClass: 'memory-only',
});

function pruneExpiredTrustedEventProofs(nowEpochMs = Date.now()): void {
  pruneExpiredPolicyCapabilities({
    nowEpochMs,
    store: contentPrivilegedActionTrustedEventProofs,
  });
}

function pruneExpiredRuntimeTokens(nowEpochMs = Date.now()): void {
  pruneExpiredPolicyCapabilities({
    nowEpochMs,
    store: contentPrivilegedActionRuntimeTokens,
  });
}

function consumeContentPrivilegedActionRuntimeToken(args: {
  actionType: ContentPrivilegedActionType;
  requestId: string;
  runtimeToken: string;
  senderBinding: ContentSenderBinding;
}): boolean {
  pruneExpiredRuntimeTokens();
  const result = consumeOneShotPolicyCapability({
    policyStateId: CONTENT_ACTION_RUNTIME_TOKENS_POLICY_ID,
    scope: 'content:privileged-action',
    senderBinding: createContentPolicySenderBinding(args.senderBinding),
    store: contentPrivilegedActionRuntimeTokens,
    strategy: 'delete-before-validation',
    token: args.runtimeToken,
    validateRecord: ({ payload }) =>
      payload.actionType === args.actionType && payload.requestId === args.requestId,
  });
  return result.consumed;
}

export function issueContentPrivilegedActionTrustedEventProof(args: {
  actionType: ContentPrivilegedActionType;
  requestId: string;
  runtimeToken: string;
  senderBinding: ContentSenderBinding;
}): ContentPrivilegedActionTrustedEventProof | null {
  if (
    !consumeContentPrivilegedActionRuntimeToken({
      actionType: args.actionType,
      requestId: args.requestId,
      runtimeToken: args.runtimeToken,
      senderBinding: args.senderBinding,
    })
  ) {
    return null;
  }

  pruneExpiredTrustedEventProofs();
  const proofToken = createContentCapabilityToken();
  issuePolicyCapability({
    payload: createContentActionCapabilityPayload(args),
    policyStateId: CONTENT_ACTION_TRUSTED_EVENT_PROOFS_POLICY_ID,
    scopes: ['content:privileged-action'],
    senderBinding: createContentPolicySenderBinding(args.senderBinding),
    store: contentPrivilegedActionTrustedEventProofs,
    tokenFactory: () => proofToken,
  });
  return { proofToken };
}

export function issueContentPrivilegedActionRuntimeToken(args: {
  actionType: ContentPrivilegedActionType;
  requestId: string;
  senderBinding: ContentSenderBinding;
}): ContentPrivilegedActionRuntimeToken {
  pruneExpiredRuntimeTokens();
  const runtimeToken = createContentCapabilityToken();
  issuePolicyCapability({
    payload: createContentActionCapabilityPayload(args),
    policyStateId: CONTENT_ACTION_RUNTIME_TOKENS_POLICY_ID,
    scopes: ['content:privileged-action'],
    senderBinding: createContentPolicySenderBinding(args.senderBinding),
    store: contentPrivilegedActionRuntimeTokens,
    tokenFactory: () => runtimeToken,
  });
  return { runtimeToken };
}

export function consumeTrustedEventProofForCapabilityRequest(args: {
  actionType: ContentPrivilegedActionType;
  requestId: string;
  senderBinding: ContentSenderBinding;
  source: Extract<ContentPrivilegedActionRequestSource, { kind: 'trusted-content-event-proof' }>;
}): boolean {
  pruneExpiredTrustedEventProofs();
  const result = consumeOneShotPolicyCapability({
    policyStateId: CONTENT_ACTION_TRUSTED_EVENT_PROOFS_POLICY_ID,
    scope: 'content:privileged-action',
    senderBinding: createContentPolicySenderBinding(args.senderBinding),
    store: contentPrivilegedActionTrustedEventProofs,
    strategy: 'delete-before-validation',
    token: args.source.proofToken,
    validateRecord: ({ payload }) =>
      payload.actionType === args.actionType && payload.requestId === args.requestId,
  });
  return result.consumed;
}

export function resetContentPrivilegedActionProofsForTests(): void {
  contentPrivilegedActionTrustedEventProofs.clear();
  contentPrivilegedActionRuntimeTokens.clear();
}
