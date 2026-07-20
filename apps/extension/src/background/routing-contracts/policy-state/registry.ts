import type { PolicyStateDescriptor } from './types';
import { capabilityPolicyStateDescriptors } from './capability-descriptors';
import { runtimePolicyStateDescriptors } from './runtime-descriptors';
import { stagedPolicyStateDescriptors } from './staged-descriptors';

export const policyStateRegistry = [
  ...capabilityPolicyStateDescriptors,
  ...runtimePolicyStateDescriptors,
  ...stagedPolicyStateDescriptors,
] as const satisfies readonly PolicyStateDescriptor[];
