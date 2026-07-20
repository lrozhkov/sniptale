import { getPolicyStateDescriptor, hasPolicyStateDescriptor } from '../../policy-state';

export function getPolicyStateTtlMs(policyStateId: string): number | null {
  const descriptor = hasPolicyStateDescriptor(policyStateId)
    ? getPolicyStateDescriptor(policyStateId)
    : undefined;
  return descriptor?.ttlMs ?? null;
}

export function requirePolicyStateTtlMs(policyStateId: string): number {
  const descriptor = hasPolicyStateDescriptor(policyStateId)
    ? getPolicyStateDescriptor(policyStateId)
    : undefined;
  if (!descriptor) {
    throw new Error(`Unknown policy state id: ${policyStateId}`);
  }
  if (!descriptor.requiresTtl || descriptor.ttlMs === undefined) {
    throw new Error(`Policy state does not declare a TTL: ${policyStateId}`);
  }
  return descriptor.ttlMs;
}
