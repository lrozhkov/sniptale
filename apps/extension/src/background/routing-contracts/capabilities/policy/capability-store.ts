import {
  createCapabilityContext,
  type CapabilityContext,
  type CapabilityScope,
} from '@sniptale/platform/security/capability-context';
import type { PolicyStateId } from '../../policy-state';
import { requirePolicyStateTtlMs } from './ttl';
import { type PolicySenderBinding, createPolicySenderBinding } from './sender-binding';

export type PolicyCapabilityRecord<TPayload> = {
  readonly capabilityContext: CapabilityContext;
  readonly issuedAtEpochMs: number;
  readonly payload: TPayload;
  readonly policyStateId: PolicyStateId;
  readonly senderBinding: PolicySenderBinding;
};

export type PolicyCapabilityStore<TPayload> = {
  delete(token: string): void;
  entries(): IterableIterator<[string, PolicyCapabilityRecord<TPayload>]>;
  get(token: string): PolicyCapabilityRecord<TPayload> | undefined;
  set(token: string, record: PolicyCapabilityRecord<TPayload>): void;
};

export function createMemoryPolicyCapabilityStore<TPayload>(): PolicyCapabilityStore<TPayload> {
  const records = new Map<string, PolicyCapabilityRecord<TPayload>>();
  return {
    delete: (token) => {
      records.delete(token);
    },
    entries: () => records.entries(),
    get: (token) => records.get(token),
    set: (token, record) => {
      records.set(token, record);
    },
  };
}

export function issuePolicyCapability<TPayload>(args: {
  readonly nowEpochMs?: number | undefined;
  readonly payload: TPayload;
  readonly policyStateId: PolicyStateId;
  readonly scopes: readonly CapabilityScope[];
  readonly senderBinding: PolicySenderBinding;
  readonly store: PolicyCapabilityStore<TPayload>;
  readonly tokenFactory?: (() => string) | undefined;
}): string {
  const nowEpochMs = args.nowEpochMs ?? Date.now();
  const token = args.tokenFactory?.() ?? crypto.randomUUID();
  const normalizedBinding = createPolicySenderBinding({
    documentId: args.senderBinding.documentId,
    frameId: args.senderBinding.frameId,
    origin: args.senderBinding.origin,
    senderUrl: args.senderBinding.senderUrl,
    tabId: args.senderBinding.tabId,
  });

  args.store.set(token, {
    capabilityContext: createCapabilityContext({
      expiresAtEpochMs: nowEpochMs + requirePolicyStateTtlMs(args.policyStateId),
      origin: normalizedBinding.origin,
      scopes: args.scopes,
      tabId: normalizedBinding.tabId ?? null,
      token,
    }),
    issuedAtEpochMs: nowEpochMs,
    payload: args.payload,
    policyStateId: args.policyStateId,
    senderBinding: normalizedBinding,
  });
  return token;
}

export function pruneExpiredPolicyCapabilities<TPayload>(args: {
  readonly nowEpochMs?: number | undefined;
  readonly store: PolicyCapabilityStore<TPayload>;
}): void {
  const nowEpochMs = args.nowEpochMs ?? Date.now();
  for (const [token, record] of args.store.entries()) {
    if (record.capabilityContext.expiresAtEpochMs <= nowEpochMs) {
      args.store.delete(token);
    }
  }
}
