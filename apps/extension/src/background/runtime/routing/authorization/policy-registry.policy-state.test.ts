import { expect, it } from 'vitest';

import { authorizationPolicyRegistry } from './policy-registry';
import {
  hasPolicyStateDescriptor,
  policyStateRegistry,
} from '../../../routing-contracts/policy-state';

it('links authorization policy entries to known policy-state descriptors', () => {
  for (const entry of authorizationPolicyRegistry) {
    for (const policyStateId of entry.policyStateIds ?? []) {
      expect(hasPolicyStateDescriptor(policyStateId), `${entry.key}:${policyStateId}`).toBe(true);
    }
  }
});

it('requires capability-owning authorization policies to declare policy-state ids', () => {
  const capabilityPolicies = authorizationPolicyRegistry.filter(
    (entry) => entry.capabilityOwnerModule
  );

  expect(capabilityPolicies.length).toBeGreaterThan(0);
  expect(capabilityPolicies.every((entry) => (entry.policyStateIds?.length ?? 0) > 0)).toBe(true);
});

it('references policy-state ids with exactly one descriptor', () => {
  const descriptorCountById = new Map<string, number>();
  for (const descriptor of policyStateRegistry) {
    descriptorCountById.set(descriptor.id, (descriptorCountById.get(descriptor.id) ?? 0) + 1);
  }

  for (const entry of authorizationPolicyRegistry) {
    for (const policyStateId of entry.policyStateIds ?? []) {
      expect(descriptorCountById.get(policyStateId), `${entry.key}:${policyStateId}`).toBe(1);
    }
  }
});
