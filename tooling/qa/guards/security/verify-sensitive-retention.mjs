/**
 * Blocks persistent browser storage writes that retain prompt/content payloads
 * outside explicit policy owners.
 */

import {
  collectCodeFiles,
  isExecutedAsScript,
  printViolations,
  repoRoot,
} from '../../core/shared.mjs';
import { collectPolicyBackedStorageFieldViolations } from './helpers/policy-scan.mjs';
import { readPolicy, toRootRelativePath } from './security-policy-utils.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-storage-ownership.data.json';
const CONTENT_RETENTION_PATTERN =
  /\b(?:prompt|markdownData|jsonData|rawResponse|html)\b(?:\s*:|\s*[,}])/u;
const PRIVATE_RETENTION_PATTERN =
  /\b(?:innerHtml|outerHtml|cookie|authorization)\b(?:\s*:|\s*[,}])/u;
const VIDEO_PREVIEW_RETENTION_PATTERN =
  /\b(?:VideoPreviewCacheRecord|contentRevision|fingerprint|segments)\b/u;
const RETENTION_FIELD_PATTERN = {
  test(source) {
    return (
      CONTENT_RETENTION_PATTERN.test(source) ||
      PRIVATE_RETENTION_PATTERN.test(source) ||
      VIDEO_PREVIEW_RETENTION_PATTERN.test(source)
    );
  },
};

export function collectSensitiveRetentionViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  return collectPolicyBackedStorageFieldViolations(files, {
    fieldPattern: RETENTION_FIELD_PATTERN,
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
