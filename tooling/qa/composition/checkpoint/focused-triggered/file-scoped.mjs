import { runDiagnosticSanitizationCheck } from '../../../guards/security/verify-diagnostic-sanitization.mjs';
import { runFetchOwnershipCheck } from '../../../guards/security/network/credential-ownership/check.mjs';
import {
  collectFocusedI18nFiles,
  collectFocusedSecurityDataFiles,
  collectFocusedSharedStyleFiles,
} from './helpers.mjs';
import { runI18nCheck } from '../../../guards/product-contracts/verify-i18n.mjs';
import { runSecretStorageCheck } from '../../../guards/security/verify-secret-storage.mjs';
import { runSensitiveRetentionCheck } from '../../../guards/security/verify-sensitive-retention.mjs';
import { runSharedStyleOwnershipCheck } from '../../../guards/product-contracts/verify-shared-style-ownership.mjs';
import {
  createSkippedStep,
  createStringFailureStep,
  createViolationStep,
} from '../focused-qa-results.mjs';
import { timeSyncStep } from '../../../runtime/observability/step-timing.helpers.mjs';

const SECURITY_DATA_TRIGGER_DEFINITIONS = [
  ['Secret storage', runSecretStorageCheck, 'Secret storage violations found:'],
  ['Sensitive retention', runSensitiveRetentionCheck, 'Sensitive retention violations found:'],
  ['Fetch ownership', runFetchOwnershipCheck, 'Fetch ownership violations found:'],
  [
    'Diagnostic sanitization',
    runDiagnosticSanitizationCheck,
    'Diagnostic sanitization violations found:',
  ],
];

const OWNERSHIP_TRIGGER_DEFINITIONS = [
  [
    'Shared style ownership',
    runSharedStyleOwnershipCheck,
    'Shared style ownership guardrail violations found:',
  ],
];

function createTriggeredResult(label, files, runner, header) {
  if (files.length === 0) {
    return createSkippedStep(label);
  }

  return createViolationStep(label, header, runner());
}

function createTimedTriggeredStep([label, runner, header], files) {
  return timeSyncStep(() => createTriggeredResult(label, files, () => runner({ files }), header));
}

function runI18nTriggeredCheck(i18nFiles) {
  if (i18nFiles.length === 0) {
    return [timeSyncStep(() => createSkippedStep('i18n'))];
  }

  return [
    timeSyncStep(() =>
      createStringFailureStep(
        'i18n',
        'i18n guardrail violations found:',
        runI18nCheck({ files: i18nFiles })
      )
    ),
  ];
}

export function runFileScopedTriggeredChecks(
  targetFiles,
  jsLikeFiles,
  {
    collectSecurityFiles = collectFocusedSecurityDataFiles,
    securityDefinitions = SECURITY_DATA_TRIGGER_DEFINITIONS,
  } = {}
) {
  const securityDataFiles = collectSecurityFiles(targetFiles);
  const sharedStyleFiles = collectFocusedSharedStyleFiles(targetFiles);
  const i18nFiles = collectFocusedI18nFiles(targetFiles);

  return [
    ...securityDefinitions.map((definition) =>
      createTimedTriggeredStep(definition, securityDataFiles)
    ),
    ...OWNERSHIP_TRIGGER_DEFINITIONS.map((definition) =>
      createTimedTriggeredStep(definition, sharedStyleFiles)
    ),
    ...runI18nTriggeredCheck(i18nFiles),
  ];
}
