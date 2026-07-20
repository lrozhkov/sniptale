/**
 * Blocks secret-bearing fetch headers outside the approved network transport owners.
 */

import ts from 'typescript';

import {
  collectCodeFiles,
  isExecutedAsScript,
  printViolations,
  repoRoot,
} from '../../core/shared.mjs';
import { getCallExpressionName } from '../../core/typescript-ast-helpers.mjs';
import { forEachPolicySourceFile, getNodeLine, visitSourceNodes } from './helpers/policy-scan.mjs';
import {
  collectPolicyRegistryViolations,
  readPolicy,
  toRootRelativePath,
} from './security-policy-utils.mjs';

const POLICY_PATH = 'tooling/configs/qa/security-network-ownership.data.json';
const SECRET_HEADER_PATTERN =
  /\b(?:Authorization|authorization|Cookie|cookie|X-API-Key|x-api-key)\b/u;
const CREDENTIALS_INCLUDE_PATTERN = /\bcredentials\s*:\s*['"]include['"]/u;

function isFetchCall(node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  if (ts.isIdentifier(node.expression)) {
    return node.expression.text === 'fetch';
  }

  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'fetch';
}

function isInlineObjectConfig(node) {
  return ts.isObjectLiteralExpression(node);
}

function hasSecretBearingHeaders(node, sourceFile) {
  return SECRET_HEADER_PATTERN.test(node.getText(sourceFile));
}

function hasCredentialedFetchConfig(node, sourceFile) {
  return CREDENTIALS_INCLUDE_PATTERN.test(node.getText(sourceFile));
}

function propertyName(property) {
  if (!property.name) return null;
  return ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)
    ? property.name.text
    : null;
}

function isFetchConfigOwner(node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  return node.arguments.some(
    (argument) =>
      isInlineObjectConfig(argument) &&
      argument.properties.some((property) =>
        ['credentials', 'headers'].includes(propertyName(property) ?? '')
      )
  );
}

function pushSecretHeaderViolation({
  isFetchOwner,
  node,
  relativePath,
  secretHeaderAllowlistedFiles,
  sourceFile,
  violations,
}) {
  if (isFetchOwner || secretHeaderAllowlistedFiles.has(relativePath)) {
    return;
  }

  violations.push({
    rule: 'fetch-secret-header-outside-owner',
    file: relativePath,
    line: getNodeLine(sourceFile, node),
    message: isFetchCall(node)
      ? 'assembles secret-bearing fetch headers outside the approved network transport owner'
      : `assembles secret-bearing request headers in helper "${getCallExpressionName(node) ?? '<call>'}" ` +
        'outside the approved network transport owner',
  });
}

function pushCredentialedRequestViolation({
  credentialedFetchAllowlistedFiles,
  isFetchOwner,
  node,
  relativePath,
  sourceFile,
  violations,
}) {
  if (isFetchOwner || credentialedFetchAllowlistedFiles.has(relativePath)) {
    return;
  }

  violations.push({
    rule: 'fetch-credentialed-request-outside-owner',
    file: relativePath,
    line: getNodeLine(sourceFile, node),
    message: isFetchCall(node)
      ? 'assembles a credentialed fetch outside the approved same-origin export/network owners'
      : `assembles a credentialed request helper "${getCallExpressionName(node) ?? '<call>'}" ` +
        'outside the approved same-origin export/network owners',
  });
}

function collectFetchNodeViolations(params) {
  const {
    credentialedFetchAllowlistedFiles,
    node,
    relativePath,
    secretHeaderAllowlistedFiles,
    sourceFile,
    violations,
  } = params;
  const fetchOwner = isFetchCall(node);
  const helperOwner = !fetchOwner && isFetchConfigOwner(node);

  if ((fetchOwner || helperOwner) && hasSecretBearingHeaders(node, sourceFile)) {
    pushSecretHeaderViolation({
      isFetchOwner: secretHeaderAllowlistedFiles.has(relativePath),
      node,
      relativePath,
      secretHeaderAllowlistedFiles,
      sourceFile,
      violations,
    });
  }

  if ((fetchOwner || helperOwner) && hasCredentialedFetchConfig(node, sourceFile)) {
    pushCredentialedRequestViolation({
      credentialedFetchAllowlistedFiles,
      isFetchOwner: credentialedFetchAllowlistedFiles.has(relativePath),
      node,
      relativePath,
      sourceFile,
      violations,
    });
  }
}

function collectFetchPolicyViolations(policy, policyPath, rootDir) {
  return [
    ...collectPolicyRegistryViolations(
      policy.secretHeaderOwners,
      policyPath,
      'fetch-ownership',
      rootDir
    ),
    ...collectPolicyRegistryViolations(
      policy.credentialedFetchOwners ?? [],
      policyPath,
      'fetch-ownership',
      rootDir
    ),
  ];
}

function collectFileFetchOwnershipViolations(params) {
  const {
    credentialedFetchAllowlistedFiles,
    relativePath,
    secretHeaderAllowlistedFiles,
    sourceFile,
    violations,
  } = params;

  visitSourceNodes(sourceFile, (node) => {
    collectFetchNodeViolations({
      credentialedFetchAllowlistedFiles,
      node,
      relativePath,
      secretHeaderAllowlistedFiles,
      sourceFile,
      violations,
    });
  });
}

export function collectFetchOwnershipViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  const secretHeaderAllowlistedFiles = new Set(
    policy.secretHeaderOwners.map((entry) => entry.file)
  );
  const credentialedFetchAllowlistedFiles = new Set(
    (policy.credentialedFetchOwners ?? []).map((entry) => entry.file)
  );
  const violations = collectFetchPolicyViolations(policy, policyPath, rootDir);

  forEachPolicySourceFile(files, { rootDir }, ({ relativePath, sourceFile }) => {
    collectFileFetchOwnershipViolations({
      credentialedFetchAllowlistedFiles,
      relativePath,
      secretHeaderAllowlistedFiles,
      sourceFile,
      violations,
    });
  });

  return violations;
}

export function runFetchOwnershipCheck({
  files = [],
  policyPath = POLICY_PATH,
  rootDir = repoRoot,
} = {}) {
  const targetFiles = files.length > 0 ? files : collectCodeFiles();
  return {
    files: targetFiles.map((file) => toRootRelativePath(rootDir, file)),
    violations: collectFetchOwnershipViolations(targetFiles, { policyPath, rootDir }),
  };
}

if (isExecutedAsScript(import.meta.url)) {
  const result = runFetchOwnershipCheck();

  if (result.violations.length > 0) {
    printViolations('Fetch ownership violations found:', result.violations);
    process.exit(1);
  }

  process.stdout.write('Fetch ownership passed\n');
}
