import { resolveCapabilityOrigin } from '@sniptale/platform/security/capability-context';

export type PolicySenderBinding = {
  readonly documentId?: string | undefined;
  readonly frameId?: number | undefined;
  readonly origin?: string | null | undefined;
  readonly senderUrl?: string | undefined;
  readonly tabId?: number | undefined;
};

export function createPolicySenderBinding(args: {
  readonly documentId?: string | undefined;
  readonly frameId?: number | undefined;
  readonly origin?: string | null | undefined;
  readonly senderUrl?: string | undefined;
  readonly tabId?: number | undefined;
}): PolicySenderBinding {
  return {
    ...(args.documentId === undefined ? {} : { documentId: args.documentId }),
    ...(args.frameId === undefined ? {} : { frameId: args.frameId }),
    origin: args.origin ?? resolveCapabilityOrigin(args.senderUrl),
    ...(args.senderUrl === undefined ? {} : { senderUrl: args.senderUrl }),
    ...(args.tabId === undefined ? {} : { tabId: args.tabId }),
  };
}

export function isPolicySenderBindingMatch(
  expected: PolicySenderBinding,
  actual: PolicySenderBinding
): boolean {
  return (
    expected.documentId === actual.documentId &&
    expected.frameId === actual.frameId &&
    expected.origin === actual.origin &&
    expected.senderUrl === actual.senderUrl &&
    expected.tabId === actual.tabId
  );
}
