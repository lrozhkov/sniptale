/**
 * Blocks persistent browser storage writes that retain prompt/content payloads
 * outside explicit policy owners.
 */

import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import { collectPolicyBackedStorageFieldViolations } from './helpers/policy-scan.mjs';
import { readPolicy, toRootRelativePath } from './security-policy-utils.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-storage-ownership.data.json';
const RETENTION_FIELDS = [
  'prompt',
  'markdownData',
  'jsonData',
  'rawResponse',
  'html',
  'innerHtml',
  'outerHtml',
  'cookie',
  'authorization',
  'VideoPreviewCacheRecord',
  'contentRevision',
  'fingerprint',
  'segments',
  'gallerySavedView',
  'annotationForkSession',
  'frameAnnotationRaster',
  'outputSha256',
];

export function collectSensitiveRetentionViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  return collectPolicyBackedStorageFieldViolations(files, {
    canonicalFields: RETENTION_FIELDS,
    exactOwnerStoragePolicy: true,
    includeSessionStorage: true,
    message:
      'persists prompt/content-bearing payload fields through browser storage outside the approved policy owners',
    ownerEntries: policy.sensitiveRetentionOwners,
    policyKind: 'sensitive-retention',
    policyPath,
    rootDir,
    rule: 'sensitive-retention-outside-owner',
  });
}

export function runSensitiveRetentionCheck({
  files = [],
  policyPath = POLICY_PATH,
  rootDir = repoRoot,
} = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map((file) => toRootRelativePath(rootDir, file)),
    violations: collectSensitiveRetentionViolations(targetFiles, { policyPath, rootDir }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runSensitiveRetentionCheck();

  if (result.violations.length > 0) {
    printViolations('Sensitive retention violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Sensitive retention passed\n');
}
