import { runBrowserAdapterCheck } from './verify-browser-adapters.mjs';
import { runDestructiveAsyncSwapCheck } from './verify-destructive-async-swaps.mjs';
import { runDetachedControllerMethodCheck } from './verify-detached-controller-methods.mjs';
import { runDomainFixtureRealismCheck } from './verify-domain-fixture-realism.mjs';
import { runHistoryDetachedSnapshotCheck } from './verify-history-detached-snapshots.mjs';
import { runHistoryRevisionSemanticsCheck } from './verify-history-revision-semantics.mjs';
import { runHistoryTransactionLifecycleCheck } from './verify-history-transaction-lifecycle.mjs';
import { runHotspotRegressionCheck } from './verify-hotspot-regression.mjs';
import { runInstanceOwnershipCheck } from './verify-instance-ownership.mjs';
import { runInterfaceSurfaceCheck } from './verify-interface-surfaces.mjs';
import { runLifecycleIntentCheck } from './verify-lifecycle-intent.mjs';
import { runMessagingCheck } from './verify-messaging.mjs';
import { runNamingCheck } from './verify-naming.mjs';
import { runParserSnapshotPurityCheck } from './verify-parser-snapshot-purity.mjs';
import { runReadPathSideEffectCheck } from './verify-read-path-side-effects.mjs';
import { runMultiMessageTransitionCheck } from './verify-multi-message-transitions.mjs';
import { runRuntimeListenerSeamCheck } from './verify-runtime-listener-seams.mjs';
import { runSharedUiBoundaryCheck } from './verify-shared-ui-boundaries.mjs';
import { runReadSafeNamingCheck } from './verify-read-safe-naming.mjs';
import { runStorageWritePatternCheck } from './verify-storage-write-patterns.mjs';
import { runSuppressionDirectiveCheck } from '../guards/quality/verify-suppression-directives.mjs';
import { runSuccessFailureAsymmetryCheck } from './verify-success-failure-asymmetry.mjs';
import { runUiAutomationSeamCheck } from './verify-ui-automation-seams.mjs';
import { runReturnedObjectSurfaceCheck } from './verify-interface-surfaces.mjs';
import {
  NETWORK_POLICY_VIOLATION_STEP,
  SHARED_CONTRACT_VIOLATION_STEPS,
  SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS,
  SHARED_OWNER_PROOF_VIOLATION_STEPS,
} from './verify-quality-contract-step-definitions.mjs';

export const FOCUSED_CODE_VIOLATION_STEPS = [
  ...SHARED_CONTRACT_VIOLATION_STEPS,
  [
    'Domain fixture realism',
    'Domain fixture realism violations found:',
    runDomainFixtureRealismCheck,
  ],
  NETWORK_POLICY_VIOLATION_STEP,
  ...SHARED_OWNER_PROOF_VIOLATION_STEPS,
  ...SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS,
  [
    'Suppression directives',
    'Suppression directive violations found:',
    runSuppressionDirectiveCheck,
  ],
  ['Messaging', 'Messaging guardrail violations found:', runMessagingCheck],
  ['Browser adapters', 'Browser adapter guardrail violations found:', runBrowserAdapterCheck],
  ['Read path side effects', 'Read-path side-effect violations found:', runReadPathSideEffectCheck],
  ['Read-safe naming', 'Read-safe naming violations found:', runReadSafeNamingCheck],
  [
    'Lifecycle intent loss',
    'Lifecycle intent guardrail violations found:',
    runLifecycleIntentCheck,
  ],
  [
    'Success/failure asymmetry',
    'Success/failure asymmetry violations found:',
    runSuccessFailureAsymmetryCheck,
  ],
  [
    'Destructive async swaps',
    'Destructive async swap violations found:',
    runDestructiveAsyncSwapCheck,
  ],
  [
    'Storage write patterns',
    'Storage write-pattern violations found:',
    runStorageWritePatternCheck,
  ],
  [
    'Detached controller methods',
    'Detached controller method violations found:',
    runDetachedControllerMethodCheck,
  ],
  [
    'Parser snapshot purity',
    'Parser snapshot purity violations found:',
    runParserSnapshotPurityCheck,
  ],
  [
    'History revision semantics',
    'History revision semantics violations found:',
    runHistoryRevisionSemanticsCheck,
  ],
  [
    'History detached snapshots',
    'History detached-snapshot violations found:',
    runHistoryDetachedSnapshotCheck,
  ],
  [
    'History transaction lifecycle',
    'History transaction lifecycle violations found:',
    runHistoryTransactionLifecycleCheck,
  ],
  ['Shared UI boundaries', 'Shared UI boundary violations found:', runSharedUiBoundaryCheck],
  ['Naming', 'Naming violations found:', runNamingCheck],
  ['Hotspot regression', 'Hotspot regression violations found:', runHotspotRegressionCheck],
  ['Interface surfaces', 'Broad interface surface violations found:', runInterfaceSurfaceCheck],
  [
    'Returned object surfaces',
    'Broad returned object surface violations found:',
    runReturnedObjectSurfaceCheck,
  ],
  [
    'Multi-message transitions',
    'Multi-message transition violations found:',
    runMultiMessageTransitionCheck,
  ],
  ['UI automation seams', 'UI automation seam violations found:', runUiAutomationSeamCheck],
  [
    'Interactive controller ownership',
    'Interactive controller ownership violations found:',
    runInstanceOwnershipCheck,
  ],
  [
    'Runtime listener ownership',
    'Runtime listener ownership violations found:',
    runRuntimeListenerSeamCheck,
  ],
];
