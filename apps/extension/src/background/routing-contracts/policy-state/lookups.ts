import { policyStateRegistry } from './registry';
import type { PolicyStateDescriptor, PolicyStateId } from './types';

const policyStateDescriptorById = new Map<PolicyStateId, PolicyStateDescriptor>(
  policyStateRegistry.map((descriptor) => [descriptor.id, descriptor])
);

export function getPolicyStateDescriptor(id: string): PolicyStateDescriptor | undefined {
  return policyStateDescriptorById.get(id as PolicyStateId);
}

export function assertPolicyStateDescriptor(id: string): PolicyStateDescriptor {
  const descriptor = getPolicyStateDescriptor(id);
  if (!descriptor) {
    throw new Error(`Unknown policy state id: ${id}`);
  }
  return descriptor;
}

export function hasPolicyStateDescriptor(id: string): id is PolicyStateId {
  return policyStateDescriptorById.has(id as PolicyStateId);
}
