import { QUALITY_CONTRACT_VIOLATION_STEPS } from './verify-all.violation-steps.quality.mjs';
import { RUNTIME_SECURITY_VIOLATION_STEPS } from './verify-all.violation-steps.runtime.mjs';
import { LIFECYCLE_VIOLATION_STEPS } from './verify-all.violation-steps.lifecycle.mjs';
import { ARCHITECTURE_VIOLATION_STEPS } from './verify-all.violation-steps.architecture.mjs';

export const VERIFY_ALL_VIOLATION_STEPS = [
  ...QUALITY_CONTRACT_VIOLATION_STEPS,
  ...RUNTIME_SECURITY_VIOLATION_STEPS,
  ...LIFECYCLE_VIOLATION_STEPS,
  ...ARCHITECTURE_VIOLATION_STEPS,
];
