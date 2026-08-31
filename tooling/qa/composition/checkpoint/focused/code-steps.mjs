import { runBrowserAdapterCheck } from '../../../guards/boundaries/browser/browser-adapters/check.mjs';
import { runDetachedControllerMethodCheck } from '../../../guards/quality/detached-controller-methods/check.mjs';
import { runDomainFixtureRealismCheck } from '../../../guards/product-contracts/verify-domain-fixture-realism.mjs';
import { runInstanceOwnershipCheck } from '../../../guards/architecture/ownership/instance-ownership/check.mjs';
import { runNamingCheck } from '../../../guards/quality/naming/check.mjs';
import { runParserSnapshotPurityCheck } from '../../../guards/product-contracts/verify-parser-snapshot-purity.mjs';
import { runReadPathSideEffectCheck } from '../../../guards/lifecycle/read-path-side-effects/check.mjs';
import { runPersistenceOwnershipCheck } from '../../../guards/lifecycle/persistence-ownership/check.mjs';
import { runSuppressionDirectiveCheck } from '../../../guards/quality/verify-suppression-directives.mjs';
import { runUiAutomationSeamCheck } from '../../../guards/product-contracts/ui-automation/verify-ui-automation-seams.mjs';
import {
  NETWORK_POLICY_VIOLATION_STEP,
  SHARED_CONTRACT_VIOLATION_STEPS,
  SHARED_ENTRYPOINT_LOGGING_VIOLATION_STEPS,
  SHARED_OWNER_PROOF_VIOLATION_STEPS,
} from '../../control-inventory/verify-quality-contract-step-definitions.mjs';
import { collectQaOccurrences } from '../../catalog/catalog.mjs';

const messagingOccurrence = collectQaOccurrences({ lane: 'focused-guardrail' }).find(
  ({ id }) => id === 'qa.rule.messaging'
);
if (!messagingOccurrence) throw new Error('Missing Messaging catalog occurrence');
export const FOCUSED_CONTEXTUAL_VIOLATION_STEPS = [
  {
    id: messagingOccurrence.id.replace(/^qa\.rule\./u, ''),
    label: messagingOccurrence.label,
    header: 'Messaging guardrail violations found:',
    tool: messagingOccurrence.tool,
  },
];

const FOCUSED_CODE_ADAPTER_DEFINITIONS = [
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
    { preserveImportOnly: true },
  ],
  ['Browser adapters', 'Browser adapter guardrail violations found:', runBrowserAdapterCheck],
  ['Read path side effects', 'Read-path side-effect violations found:', runReadPathSideEffectCheck],
  [
    'Persistence ownership',
    'Storage write-pattern violations found:',
    runPersistenceOwnershipCheck,
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
  ['Naming', 'Naming violations found:', runNamingCheck, { preserveImportOnly: true }],
  ['UI automation seams', 'UI automation seam violations found:', runUiAutomationSeamCheck],
  [
    'Interactive controller ownership',
    'Interactive controller ownership violations found:',
    runInstanceOwnershipCheck,
  ],
];

const focusedGuardrailOccurrences = collectQaOccurrences({ lane: 'focused-guardrail' });
const focusedGuardrailByLabel = new Map(
  focusedGuardrailOccurrences.map((occurrence) => [occurrence.label, occurrence])
);
const focusedCodeAdapters = new Map(
  FOCUSED_CODE_ADAPTER_DEFINITIONS.map((adapter) => {
    const occurrence = focusedGuardrailByLabel.get(adapter[0]);
    if (!occurrence) throw new Error(`Unregistered focused guardrail adapter: ${adapter[0]}`);
    return [occurrence.id, adapter];
  })
);
const unknownFocusedAdapters = [...focusedCodeAdapters].filter(
  ([id]) => !focusedGuardrailOccurrences.some((occurrence) => occurrence.id === id)
);
if (unknownFocusedAdapters.length > 0) {
  throw new Error(
    `Unknown focused guardrail adapters: ${unknownFocusedAdapters.map(([id]) => id).join(', ')}`
  );
}

export const FOCUSED_CODE_VIOLATION_STEPS = focusedGuardrailOccurrences.flatMap((occurrence) => {
  const adapter = focusedCodeAdapters.get(occurrence.id);
  return adapter ? [adapter] : [];
});
