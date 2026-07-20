import { runDiagnosticSanitizationCheck } from '../guards/security/verify-diagnostic-sanitization.mjs';
import { runFetchOwnershipCheck } from '../guards/security/verify-fetch-ownership.mjs';
import {
  collectFocusedHeavyRuntimeImportFiles,
  collectFocusedExportArtifactBoundaryFiles,
  collectFocusedI18nFiles,
  collectFocusedSecurityDataFiles,
  collectFocusedSharedStyleFiles,
  collectFocusedStorageWritePatternFiles,
} from './verify-focused-triggered.helpers.mjs';
import { runHeavyRuntimeImportOwnershipCheck } from './verify-heavy-runtime-import-ownership.mjs';
import { runExportArtifactBoundaryCheck } from './verify-export-artifact-boundaries.mjs';
import { runI18nCheck } from './verify-i18n.mjs';
import { runRootScatterCheck } from './verify-root-scatter.mjs';
import { runSecretStorageCheck } from '../guards/security/verify-secret-storage.mjs';
import { runSensitiveRetentionCheck } from '../guards/security/verify-sensitive-retention.mjs';
import { runStorageWritePatternCheck } from './verify-storage-write-patterns.mjs';
import { runSharedStyleOwnershipCheck } from './verify-shared-style-ownership.mjs';
import {
  createSkippedStep,
  createStringFailureStep,
  createViolationStep,
} from './focused-qa-results.mjs';
import { timeSyncStep } from './step-timing.helpers.mjs';

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
    'Heavy runtime imports',
    runHeavyRuntimeImportOwnershipCheck,
    'Heavy runtime import ownership violations found:',
  ],
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

export function runFileScopedTriggeredChecks(targetFiles, jsLikeFiles) {
  const securityDataFiles = collectFocusedSecurityDataFiles(jsLikeFiles);
  const heavyRuntimeImportFiles = collectFocusedHeavyRuntimeImportFiles(jsLikeFiles);
  const exportArtifactBoundaryFiles = collectFocusedExportArtifactBoundaryFiles(jsLikeFiles);
  const sharedStyleFiles = collectFocusedSharedStyleFiles(targetFiles);
  const storageWritePatternFiles = collectFocusedStorageWritePatternFiles(jsLikeFiles);
  const i18nFiles = collectFocusedI18nFiles(targetFiles);

  return [
    timeSyncStep(() =>
      createViolationStep(
        'Root scatter',
        'Root scatter violations found:',
        runRootScatterCheck({ files: targetFiles })
      )
    ),
    ...SECURITY_DATA_TRIGGER_DEFINITIONS.map((definition) =>
      createTimedTriggeredStep(definition, securityDataFiles)
    ),
    ...OWNERSHIP_TRIGGER_DEFINITIONS.map((definition) =>
      createTimedTriggeredStep(
        definition,
        definition[0] === 'Shared style ownership' ? sharedStyleFiles : heavyRuntimeImportFiles
      )
    ),
    timeSyncStep(() =>
      createTriggeredResult(
        'Storage write patterns',
        storageWritePatternFiles,
        () => runStorageWritePatternCheck({ files: storageWritePatternFiles }),
        'Storage write-pattern violations found:'
      )
    ),
    timeSyncStep(() =>
      createTriggeredResult(
        'Export artifact boundaries',
        exportArtifactBoundaryFiles,
        () => runExportArtifactBoundaryCheck({ files: exportArtifactBoundaryFiles }),
        'Export artifact boundary violations found:'
      )
    ),
    ...runI18nTriggeredCheck(i18nFiles),
  ];
}
