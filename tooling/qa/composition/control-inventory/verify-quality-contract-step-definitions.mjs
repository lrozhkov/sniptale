import { runBoundaryCastCheck } from '../../guards/boundaries/boundary-casts/check.mjs';
import { runBoundaryInputCheck } from '../../guards/boundaries/boundary-inputs/check.mjs';
import { runEntrypointWiringCheck } from '../../guards/product-contracts/entrypoints/verify-entrypoint-wiring.mjs';
import { runNetworkFetchPolicyCheck } from '../../guards/security/network/verify-network-fetch-policy.mjs';
import { runSniptaleIdentityCheck } from '../../guards/product-contracts/verify-sniptale-identity.mjs';
import { runZipPackageProfileCheck } from '../../guards/product-contracts/archive/verify-zip-package-profile.mjs';

export const SHARED_CONTRACT_VIOLATION_STEPS = [
  ['Boundary casts', 'Boundary cast guardrail violations found:', runBoundaryCastCheck],
  ['Boundary inputs', 'Boundary input guardrail violations found:', runBoundaryInputCheck],
  ['ZIP package profile', 'ZIP package profile violations found:', runZipPackageProfileCheck],
  ['Sniptale identity', 'Sniptale identity violations found:', runSniptaleIdentityCheck],
];

export const NETWORK_POLICY_VIOLATION_STEP = [
  'Network fetch policy',
  'Network fetch policy violations found:',
  runNetworkFetchPolicyCheck,
];

export const SHARED_OWNER_PROOF_VIOLATION_STEPS = [];

export const SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS = [
  ['Entrypoint wiring', 'Entrypoint wiring guardrail violations found:', runEntrypointWiringCheck],
];
