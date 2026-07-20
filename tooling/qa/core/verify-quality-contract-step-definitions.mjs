import { runBackupImportAtomicityCheck } from './verify-backup-import-atomicity.mjs';
import { runBoundaryCastCheck } from './verify-boundary-casts.mjs';
import { runBoundaryInputCheck } from './verify-boundary-inputs.mjs';
import { runContractOptionalityDriftCheck } from './verify-contract-optionality-drift.mjs';
import { runContractParserCoverageCheck } from './verify-contract-parser-coverage.mjs';
import { runEntrypointWiringCheck } from './verify-entrypoint-wiring.mjs';
import { runHotLoopWorkCheck } from './verify-hot-loop-work.mjs';
import { runLoggingCheck } from './verify-logging.mjs';
import { runMessagingSchemaCastCheck } from './verify-messaging-schema-casts.mjs';
import { runNetworkFetchPolicyCheck } from './verify-network-fetch-policy.mjs';
import { runResourceBudgetConsistencyCheck } from './verify-resource-budget-consistency.mjs';
import { runResourceLifecyclePairCheck } from './verify-resource-lifecycle-pairs.mjs';
import { runRuntimeProtocolContractCheck } from './verify-runtime-protocol-contracts.mjs';
import { runRuntimeResponsePrivacyCheck } from './verify-runtime-response-privacy.mjs';
import { runStateMachineProofCheck } from './verify-state-machine-proof.mjs';
import { runSniptaleIdentityCheck } from './verify-sniptale-identity.mjs';
import { runZipPackageProfileCheck } from './verify-zip-package-profile.mjs';

export const SHARED_CONTRACT_VIOLATION_STEPS = [
  ['Boundary casts', 'Boundary cast guardrail violations found:', runBoundaryCastCheck],
  ['Boundary inputs', 'Boundary input guardrail violations found:', runBoundaryInputCheck],
  [
    'Runtime protocol contracts',
    'Runtime protocol contract violations found:',
    runRuntimeProtocolContractCheck,
  ],
  [
    'Runtime response privacy',
    'Runtime response privacy violations found:',
    runRuntimeResponsePrivacyCheck,
  ],
  ['ZIP package profile', 'ZIP package profile violations found:', runZipPackageProfileCheck],
  ['Sniptale identity', 'Sniptale identity violations found:', runSniptaleIdentityCheck],
  [
    'Contract optionality drift',
    'Contract optionality drift violations found:',
    runContractOptionalityDriftCheck,
  ],
  [
    'Messaging schema casts',
    'Messaging schema cast violations found:',
    runMessagingSchemaCastCheck,
  ],
];

export const NETWORK_POLICY_VIOLATION_STEP = [
  'Network fetch policy',
  'Network fetch policy violations found:',
  runNetworkFetchPolicyCheck,
];

export const SHARED_OWNER_PROOF_VIOLATION_STEPS = [
  [
    'Backup import atomicity',
    'Backup/import atomicity violations found:',
    runBackupImportAtomicityCheck,
  ],
  [
    'Contract parser coverage',
    'Contract parser coverage violations found:',
    runContractParserCoverageCheck,
  ],
  [
    'Resource budget consistency',
    'Resource budget consistency violations found:',
    runResourceBudgetConsistencyCheck,
  ],
  [
    'Resource lifecycle pairs',
    'Resource lifecycle pair violations found:',
    runResourceLifecyclePairCheck,
  ],
  ['State-machine proof', 'State-machine proof violations found:', runStateMachineProofCheck],
  ['Hot-loop work', 'Hot-loop work violations found:', runHotLoopWorkCheck],
];

export const SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS = [
  ['Entrypoint wiring', 'Entrypoint wiring guardrail violations found:', runEntrypointWiringCheck],
  ['Logging policy', 'Logging policy violations found:', runLoggingCheck],
];
