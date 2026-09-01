import { runBrowserAdapterCheck } from '../../../guards/boundaries/browser/browser-adapters/check.mjs';
import { runMessagingCheck } from '../../../guards/boundaries/verify-messaging.mjs';
import { runPersistenceOwnershipCheck } from '../../../guards/lifecycle/persistence-ownership/check.mjs';
import { runReadPathSideEffectCheck } from '../../../guards/lifecycle/read-path-side-effects/check.mjs';
import { runAppCoreOwnerCheck } from '../../../guards/architecture/app-core/verify-app-core-owners.mjs';
import { runArchitectureGuardrailCheck } from '../../../guards/architecture/architecture-guardrails/check.mjs';
import { runManifestPermissionsCheck } from '../../../guards/architecture/manifest-permissions/check.mjs';
import { runInstanceOwnershipCheck } from '../../../guards/architecture/ownership/instance-ownership/check.mjs';
import { runRuntimeTopologyCheck } from '../../../guards/architecture/runtime-topology/check.mjs';
import { runForwardingModuleDriftCheck } from '../../../guards/architecture/forwarding-module-drift/check.mjs';
import { runUiAutomationSeamCheck } from '../../../guards/product-contracts/ui-automation/verify-ui-automation-seams.mjs';
import { runConfigPolicyCheck } from '../../../guards/product-contracts/config/config-policy/check.mjs';
import { runExtensionBuildLayoutCheck } from '../../../guards/product-contracts/extension-build/verify-extension-build-layout.mjs';
import { runDetachedControllerMethodCheck } from '../../../guards/quality/detached-controller-methods/check.mjs';
import { runDomainFixtureRealismCheck } from '../../../guards/product-contracts/verify-domain-fixture-realism.mjs';
import { runManifestIntegrityCheck } from '../../../guards/product-contracts/manifest-integrity/check.mjs';
import { runPackageBoundaryCheck } from '../../../guards/product-contracts/package-boundaries/check.mjs';
import { runParserSnapshotPurityCheck } from '../../../guards/product-contracts/verify-parser-snapshot-purity.mjs';
import { runSharedStyleOwnershipCheck } from '../../../guards/product-contracts/verify-shared-style-ownership.mjs';
import { runRepoWideRootSideEffectCheck } from '../../../guards/quality/root-side-effects/check.mjs';
import { runSuppressionDirectiveCheck } from '../../../guards/quality/verify-suppression-directives.mjs';
import { runDependencyAdmissionCheck } from '../../../guards/security/verify-dependency-admission.mjs';
import { runDiagnosticSanitizationCheck } from '../../../guards/security/verify-diagnostic-sanitization.mjs';
import { runFetchOwnershipCheck } from '../../../guards/security/network/credential-ownership/check.mjs';
import { runSecretStorageCheck } from '../../../guards/security/verify-secret-storage.mjs';
import { runSensitiveRetentionCheck } from '../../../guards/security/verify-sensitive-retention.mjs';
import { runOssReleaseSurfaceCheck } from '../../../audits/licenses/oss-release-surface/check.mjs';
import { runDocumentationFactsCheck } from '../../../policy/documentation/documentation-facts/documentation-facts.mjs';
import { runTargetOnlyPathCheck } from '../../../policy/targets/verify-target-only-paths.mjs';
import {
  NETWORK_POLICY_VIOLATION_STEP,
  SHARED_CONTRACT_VIOLATION_STEPS,
  SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS,
  SHARED_OWNER_PROOF_VIOLATION_STEPS,
} from '../../control-inventory/verify-quality-contract-step-definitions.mjs';
import { collectQaOccurrences } from '../../catalog/catalog.mjs';

const releaseGuardrailAdapterDefinitions = [
  [
    'Architecture guardrails',
    'Architecture guardrail violations found:',
    runArchitectureGuardrailCheck,
  ],
  ...SHARED_CONTRACT_VIOLATION_STEPS,
  NETWORK_POLICY_VIOLATION_STEP,
  ...SHARED_OWNER_PROOF_VIOLATION_STEPS,
  ...SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS,
  [
    'Config policy',
    'Config policy violations found:',
    () => ({ ...runConfigPolicyCheck(), populationKind: 'repository-state' }),
  ],
  [
    'Extension build layout',
    'Extension build layout violations found:',
    () => ({ ...runExtensionBuildLayoutCheck(), populationKind: 'repository-state' }),
  ],
  ['Dependency admission', 'Dependency admission violations found:', runDependencyAdmissionCheck],
  ['Secret storage', 'Secret storage violations found:', runSecretStorageCheck],
  ['Sensitive retention', 'Sensitive retention violations found:', runSensitiveRetentionCheck],
  ['Fetch ownership', 'Fetch ownership violations found:', runFetchOwnershipCheck],
  [
    'Diagnostic sanitization',
    'Diagnostic sanitization violations found:',
    runDiagnosticSanitizationCheck,
  ],
  [
    'Suppression directives',
    'Suppression directive violations found:',
    () => runSuppressionDirectiveCheck({ scope: 'production' }),
  ],
  ['Messaging', 'Messaging guardrail violations found:', runMessagingCheck],
  [
    'Forwarding module drift',
    'Forwarding module drift violations found:',
    runForwardingModuleDriftCheck,
  ],
  ['Read path side effects', 'Read-path side-effect violations found:', runReadPathSideEffectCheck],
  [
    'Persistence ownership',
    'Storage write-pattern violations found:',
    runPersistenceOwnershipCheck,
  ],
  [
    'Parser snapshot purity',
    'Parser snapshot purity violations found:',
    runParserSnapshotPurityCheck,
  ],
  ['Documentation facts', 'Documentation fact violations found:', runDocumentationFactsCheck],
  ['Manifest integrity', 'Manifest integrity violations found:', runManifestIntegrityCheck],
  ['Manifest permissions', 'Manifest permission violations found:', runManifestPermissionsCheck],
  ['Runtime topology', 'Runtime topology violations found:', runRuntimeTopologyCheck],
  ['Package boundaries', 'Package boundary violations found:', runPackageBoundaryCheck],
  ['App-core owners', 'App-core owner violations found:', runAppCoreOwnerCheck],
  ['Target-only paths', 'Target-only path violations found:', runTargetOnlyPathCheck],
  ['OSS release surface', 'OSS release surface violations found:', runOssReleaseSurfaceCheck],
  ['Browser adapters', 'Browser adapter guardrail violations found:', runBrowserAdapterCheck],
  ['Root side effects', 'Root side-effect violations found:', runRepoWideRootSideEffectCheck],
  [
    'Shared style ownership',
    'Shared style ownership guardrail violations found:',
    runSharedStyleOwnershipCheck,
  ],
  ['UI automation seams', 'UI automation seam violations found:', runUiAutomationSeamCheck],
  [
    'Interactive controller ownership',
    'Interactive controller ownership violations found:',
    runInstanceOwnershipCheck,
  ],
  [
    'Detached controller methods',
    'Detached controller method violations found:',
    runDetachedControllerMethodCheck,
  ],
  [
    'Domain fixture realism',
    'Domain fixture realism violations found:',
    runDomainFixtureRealismCheck,
  ],
];

const releaseGuardrailOccurrences = collectQaOccurrences({ lane: 'release-guardrail' });
const occurrenceByLabel = new Map(
  releaseGuardrailOccurrences.map((occurrence) => [occurrence.label, occurrence])
);
const adapterById = new Map(
  releaseGuardrailAdapterDefinitions.map((adapter) => {
    const occurrence = occurrenceByLabel.get(adapter[0]);
    if (!occurrence) throw new Error(`Unregistered release guardrail adapter: ${adapter[0]}`);
    return [occurrence.id, adapter];
  })
);
const projectedReceiptIds = new Set(['qa.rule.logging-policy']);
const missingAdapters = releaseGuardrailOccurrences.filter(
  ({ id }) => !adapterById.has(id) && !projectedReceiptIds.has(id)
);
if (missingAdapters.length > 0) {
  throw new Error(
    `Missing release guardrail adapters: ${missingAdapters.map(({ id }) => id).join(', ')}`
  );
}

export const VERIFY_ALL_VIOLATION_STEPS = releaseGuardrailOccurrences.flatMap(({ id }) => {
  const adapter = adapterById.get(id);
  return adapter ? [adapter] : [];
});
