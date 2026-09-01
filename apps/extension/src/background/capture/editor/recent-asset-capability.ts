// policyStateIds: recent-capture-editor-asset-binding
import type { RecentCaptureEditorAssetCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  consumeOneShotPolicyCapability,
  createMemoryPolicyCapabilityStore,
  issuePolicyCapability,
  pruneExpiredPolicyCapabilities,
  type PolicySenderBinding,
} from '../../routing-contracts/capabilities/policy';
import type { PolicyStateId } from '../../routing-contracts/policy-state';

const RECENT_CAPTURE_EDITOR_ASSET_POLICY_ID =
  'recent-capture-editor-asset-binding' satisfies PolicyStateId;

type RecentCaptureEditorAssetPayload = {
  readonly assetId: string;
  readonly requestId: string;
};

const recentCaptureEditorAssetCapabilities =
  createMemoryPolicyCapabilityStore<RecentCaptureEditorAssetPayload>();

export function issueRecentCaptureEditorAssetCapability(args: {
  readonly assetId: string;
  readonly nowEpochMs?: number | undefined;
  readonly requestId: string;
  readonly senderBinding: PolicySenderBinding;
}): RecentCaptureEditorAssetCapability {
  pruneExpiredPolicyCapabilities({
    nowEpochMs: args.nowEpochMs,
    store: recentCaptureEditorAssetCapabilities,
  });
  return {
    requestId: args.requestId,
    token: issuePolicyCapability({
      nowEpochMs: args.nowEpochMs,
      payload: { assetId: args.assetId, requestId: args.requestId },
      policyStateId: RECENT_CAPTURE_EDITOR_ASSET_POLICY_ID,
      scopes: ['content:privileged-action'],
      senderBinding: args.senderBinding,
      store: recentCaptureEditorAssetCapabilities,
    }),
  };
}

export function consumeRecentCaptureEditorAssetCapability(args: {
  readonly assetId: string;
  readonly capability: RecentCaptureEditorAssetCapability;
  readonly nowEpochMs?: number | undefined;
  readonly senderBinding: PolicySenderBinding;
}): boolean {
  pruneExpiredPolicyCapabilities({
    nowEpochMs: args.nowEpochMs,
    store: recentCaptureEditorAssetCapabilities,
  });
  return consumeOneShotPolicyCapability({
    nowEpochMs: args.nowEpochMs,
    policyStateId: RECENT_CAPTURE_EDITOR_ASSET_POLICY_ID,
    scope: 'content:privileged-action',
    senderBinding: args.senderBinding,
    store: recentCaptureEditorAssetCapabilities,
    strategy: 'delete-after-validation',
    token: args.capability.token,
    validateRecord: ({ payload }) =>
      payload.assetId === args.assetId && payload.requestId === args.capability.requestId,
  }).consumed;
}

export function clearRecentCaptureEditorAssetCapabilitiesForTab(tabId: number): void {
  for (const [token, record] of recentCaptureEditorAssetCapabilities.entries()) {
    if (record.senderBinding.tabId === tabId) {
      recentCaptureEditorAssetCapabilities.delete(token);
    }
  }
}

export function resetRecentCaptureEditorAssetCapabilitiesForTests(): void {
  for (const [token] of recentCaptureEditorAssetCapabilities.entries()) {
    recentCaptureEditorAssetCapabilities.delete(token);
  }
}
