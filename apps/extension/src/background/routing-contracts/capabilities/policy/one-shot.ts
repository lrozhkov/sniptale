import {
  isCapabilityContextAuthorized,
  type CapabilityScope,
} from '@sniptale/platform/security/capability-context';
import { getPolicyStateDescriptor, type PolicyStateId } from '../../policy-state';
import type { PolicyCapabilityRecord, PolicyCapabilityStore } from './capability-store';
import {
  createPolicySenderBinding,
  isPolicySenderBindingMatch,
  type PolicySenderBinding,
} from './sender-binding';

export type OneShotConsumeStrategy = 'delete-after-validation' | 'delete-before-validation';

export type PolicyCapabilityConsumeResult<TPayload> =
  | {
      readonly consumed: true;
      readonly payload: TPayload;
      readonly record: PolicyCapabilityRecord<TPayload>;
    }
  | {
      readonly consumed: false;
      readonly reason:
        | 'expired'
        | 'missing'
        | 'not-one-shot'
        | 'policy-mismatch'
        | 'record-rejected'
        | 'sender-mismatch';
    };

export function consumeOneShotPolicyCapability<TPayload>(args: {
  readonly nowEpochMs?: number | undefined;
  readonly policyStateId: PolicyStateId;
  readonly scope: CapabilityScope;
  readonly senderBinding: PolicySenderBinding;
  readonly store: PolicyCapabilityStore<TPayload>;
  readonly strategy: OneShotConsumeStrategy;
  readonly token: string;
  readonly validateRecord?: ((record: PolicyCapabilityRecord<TPayload>) => boolean) | undefined;
}): PolicyCapabilityConsumeResult<TPayload> {
  const descriptor = getPolicyStateDescriptor(args.policyStateId);
  if (!descriptor?.oneShot) {
    return { consumed: false, reason: 'not-one-shot' };
  }

  const record = args.store.get(args.token);
  if (args.strategy === 'delete-before-validation') {
    args.store.delete(args.token);
  }
  if (!record) {
    return { consumed: false, reason: 'missing' };
  }

  const failureReason = resolveConsumeFailureReason({
    ...args,
    record,
    senderBinding: createPolicySenderBinding({
      documentId: args.senderBinding.documentId,
      frameId: args.senderBinding.frameId,
      origin: args.senderBinding.origin,
      senderUrl: args.senderBinding.senderUrl,
      tabId: args.senderBinding.tabId,
    }),
  });
  if (failureReason) {
    return { consumed: false, reason: failureReason };
  }

  if (args.strategy === 'delete-after-validation') {
    args.store.delete(args.token);
  }
  return { consumed: true, payload: record.payload, record };
}

function resolveConsumeFailureReason<TPayload>(args: {
  readonly nowEpochMs?: number | undefined;
  readonly policyStateId: PolicyStateId;
  readonly record: PolicyCapabilityRecord<TPayload>;
  readonly scope: CapabilityScope;
  readonly senderBinding: PolicySenderBinding;
  readonly token: string;
  readonly validateRecord?: ((record: PolicyCapabilityRecord<TPayload>) => boolean) | undefined;
}): Exclude<PolicyCapabilityConsumeResult<TPayload>, { consumed: true }>['reason'] | null {
  if (args.record.policyStateId !== args.policyStateId) {
    return 'policy-mismatch';
  }
  if (!isPolicySenderBindingMatch(args.record.senderBinding, args.senderBinding)) {
    return 'sender-mismatch';
  }
  if (
    !isCapabilityContextAuthorized(args.record.capabilityContext, {
      origin: args.senderBinding.origin,
      scope: args.scope,
      tabId: args.senderBinding.tabId ?? null,
      token: args.token,
      nowEpochMs: args.nowEpochMs,
    })
  ) {
    return 'expired';
  }
  if (args.validateRecord && !args.validateRecord(args.record)) {
    return 'record-rejected';
  }
  return null;
}
