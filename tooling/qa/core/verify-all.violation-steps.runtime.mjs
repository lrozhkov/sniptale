import { runDiagnosticSanitizationCheck } from '../guards/security/verify-diagnostic-sanitization.mjs';
import { runDependencyAdmissionCheck } from '../guards/security/verify-dependency-admission.mjs';
import { runFetchOwnershipCheck } from '../guards/security/verify-fetch-ownership.mjs';
import { runSecretStorageCheck } from '../guards/security/verify-secret-storage.mjs';
import { runSensitiveRetentionCheck } from '../guards/security/verify-sensitive-retention.mjs';
import { runMessagingCheck } from './verify-messaging.mjs';
import { runReadPathSideEffectCheck } from './verify-read-path-side-effects.mjs';
import { runReadSafeNamingCheck } from './verify-read-safe-naming.mjs';
import { runRootScatterCheck } from './verify-root-scatter.mjs';
import { runSuppressionDirectiveCheck } from '../guards/quality/verify-suppression-directives.mjs';

export const RUNTIME_SECURITY_VIOLATION_STEPS = [
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
  ['Root scatter', 'Root scatter violations found:', runRootScatterCheck],
  ['Read path side effects', 'Read-path side-effect violations found:', runReadPathSideEffectCheck],
  ['Read-safe naming', 'Read-safe naming violations found:', runReadSafeNamingCheck],
];
