import { runArchitectureGuardrailCheck } from './verify-architecture-guardrails.mjs';
import { runExportArtifactBoundaryCheck } from './verify-export-artifact-boundaries.mjs';
import { runHotspotRegressionCheck } from './verify-hotspot-regression.mjs';
import { runRuntimeListenerSeamCheck } from './verify-runtime-listener-seams.mjs';
import {
  NETWORK_POLICY_VIOLATION_STEP,
  SHARED_CONTRACT_VIOLATION_STEPS,
  SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS,
  SHARED_OWNER_PROOF_VIOLATION_STEPS,
} from './verify-quality-contract-step-definitions.mjs';

export const QUALITY_CONTRACT_VIOLATION_STEPS = [
  ['Hotspot regression', 'Hotspot regression violations found:', runHotspotRegressionCheck],
  [
    'Architecture guardrails',
    'Architecture guardrail violations found:',
    runArchitectureGuardrailCheck,
  ],
  ...SHARED_CONTRACT_VIOLATION_STEPS,
  NETWORK_POLICY_VIOLATION_STEP,
  [
    'Export artifact boundaries',
    'Export artifact boundary violations found:',
    runExportArtifactBoundaryCheck,
  ],
  ...SHARED_OWNER_PROOF_VIOLATION_STEPS,
  [
    'Runtime listener ownership',
    'Runtime listener ownership violations found:',
    runRuntimeListenerSeamCheck,
  ],
  ...SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS,
];
