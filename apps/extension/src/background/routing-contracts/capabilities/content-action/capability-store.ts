import type {
  ContentPrivilegedActionAutoStartGrant,
  ContentPrivilegedActionCapability,
  ContentPrivilegedActionRequestSource,
  ContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { createPrivilegedCapabilityStore } from '../privileged-authority/state';
import { requirePolicyStateTtlMs } from '../policy/ttl';
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

export type { ContentSenderBinding } from './authority-shape';

const CONTENT_ACTION_CAPABILITIES_POLICY_ID = 'content-action-capabilities';
const CONTENT_ACTION_AUTO_START_GRANTS_POLICY_ID = 'content-action-auto-start-grants';

type ContentPrivilegedActionAutoStartGrantRecord = {
  allowedActionTypes: ContentPrivilegedActionType[];
  expiresAtEpochMs: number;
  tabId: number;
};

const contentPrivilegedActionCapabilities = createPrivilegedCapabilityStore<
  PolicyCapabilityRecord<ContentActionCapabilityPayload>
>({
  domain: 'background.privileged.content-action-capabilities',
  policyId: CONTENT_ACTION_CAPABILITIES_POLICY_ID,
  storageClass: 'memory-only',
});
const contentPrivilegedActionAutoStartGrants =
  createPrivilegedCapabilityStore<ContentPrivilegedActionAutoStartGrantRecord>({
    domain: 'background.privileged.content-action-auto-start-grants',
    policyId: CONTENT_ACTION_AUTO_START_GRANTS_POLICY_ID,
    storageClass: 'memory-only',
  });

function pruneExpiredAutoStartGrants(nowEpochMs = Date.now()): void {
  for (const [token, record] of contentPrivilegedActionAutoStartGrants.entries()) {
    if (record.expiresAtEpochMs <= nowEpochMs || record.allowedActionTypes.length === 0) {
      contentPrivilegedActionAutoStartGrants.delete(token);
    }
  }
}

function pruneExpiredContentActionCapabilities(nowEpochMs = Date.now()): void {
  pruneExpiredPolicyCapabilities({
    nowEpochMs,
    store: contentPrivilegedActionCapabilities,
  });
}

export function consumeAutoStartGrantForCapabilityRequest(args: {
  actionType: ContentPrivilegedActionType;
  senderBinding: ContentSenderBinding;
  source: Extract<ContentPrivilegedActionRequestSource, { kind: 'background-auto-start' }>;
}): boolean {
  pruneExpiredAutoStartGrants();
  const record = contentPrivilegedActionAutoStartGrants.get(args.source.grantToken);
  if (!record || record.tabId !== args.senderBinding.tabId) {
    contentPrivilegedActionAutoStartGrants.delete(args.source.grantToken);
    return false;
  }

  const actionIndex = record.allowedActionTypes.indexOf(args.actionType);
  if (actionIndex < 0) {
    return false;
  }

  record.allowedActionTypes.splice(actionIndex, 1);
  if (record.allowedActionTypes.length === 0) {
    contentPrivilegedActionAutoStartGrants.delete(args.source.grantToken);
  } else {
    contentPrivilegedActionAutoStartGrants.set(args.source.grantToken, record);
  }
  return true;
}

export function issueContentPrivilegedActionCapability(args: {
  actionType: ContentPrivilegedActionType;
  requestId: string;
  senderBinding: ContentSenderBinding;
}): ContentPrivilegedActionCapability {
  const token = createContentCapabilityToken();
  issuePolicyCapability({
    payload: createContentActionCapabilityPayload(args),
    policyStateId: CONTENT_ACTION_CAPABILITIES_POLICY_ID,
    scopes: ['content:privileged-action'],
    senderBinding: createContentPolicySenderBinding(args.senderBinding),
    store: contentPrivilegedActionCapabilities,
    tokenFactory: () => token,
  });

  return { requestId: args.requestId, token };
}

export function issueContentPrivilegedActionAutoStartGrant(args: {
  actionTypes: readonly ContentPrivilegedActionType[];
  tabId: number;
}): ContentPrivilegedActionAutoStartGrant {
  pruneExpiredAutoStartGrants();
  const grantToken = createContentCapabilityToken();
  contentPrivilegedActionAutoStartGrants.set(grantToken, {
    allowedActionTypes: [...args.actionTypes],
    expiresAtEpochMs:
      Date.now() + requirePolicyStateTtlMs(CONTENT_ACTION_AUTO_START_GRANTS_POLICY_ID),
    tabId: args.tabId,
  });
  return { grantToken };
}

export function consumeIssuedContentPrivilegedActionCapability(args: {
  actionType: ContentPrivilegedActionType;
  contentIntent: ContentPrivilegedActionCapability;
  senderBinding: ContentSenderBinding;
}): boolean {
  pruneExpiredContentActionCapabilities();
  const result = consumeOneShotPolicyCapability({
    policyStateId: CONTENT_ACTION_CAPABILITIES_POLICY_ID,
    scope: 'content:privileged-action',
    senderBinding: createContentPolicySenderBinding(args.senderBinding),
    store: contentPrivilegedActionCapabilities,
    strategy: 'delete-before-validation',
    token: args.contentIntent.token,
    validateRecord: ({ payload }) =>
      payload.actionType === args.actionType && payload.requestId === args.contentIntent.requestId,
  });
  return result.consumed;
}

export function resetContentPrivilegedActionCapabilityStoreForTests(): void {
  contentPrivilegedActionCapabilities.clear();
  contentPrivilegedActionAutoStartGrants.clear();
}
