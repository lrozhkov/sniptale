/**
 * Blocks browser storage writes that appear to persist plaintext secret fields
 * outside the explicit encrypted secret-owner seam.
 */

import { collectCodeFiles } from '../../analysis/repository/shared-files.mjs';
import { repoRoot } from '../../analysis/repository/shared-paths.mjs';
import { isExecutedAsScript, printViolations } from '../../runtime/process/shared-cli.mjs';
import { collectPolicyBackedStorageFieldViolations } from './helpers/policy-scan.mjs';
import { readPolicy, toRootRelativePath } from './security-policy-utils.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-storage-ownership.data.json';
const SECRET_FIELDS = ['apiKey', 'token', 'secret', 'authorization', 'cookie'];

export function collectSecretStorageViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  return collectPolicyBackedStorageFieldViolations(files, {
    canonicalFields: SECRET_FIELDS,
    exactOwnerStoragePolicy: true,
    includeSessionStorage: true,
    message:
      'persists secret-like fields through browser storage outside the approved encrypted secret owner',
    ownerEntries: policy.secretStorageOwners,
    policyKind: 'secret-storage',
    policyPath,
    rootDir,
    rule: 'secret-storage-outside-owner',
  });
}

export function runSecretStorageCheck({
  files = [],
  policyPath = POLICY_PATH,
  rootDir = repoRoot,
} = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map((file) => toRootRelativePath(rootDir, file)),
    violations: collectSecretStorageViolations(targetFiles, { policyPath, rootDir }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runSecretStorageCheck();

  if (result.violations.length > 0) {
    printViolations('Secret storage violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Secret storage passed\n');
}
