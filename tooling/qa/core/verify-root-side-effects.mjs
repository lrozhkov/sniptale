/**
 * Shared/public root side-effect guardrail.
 * Blocks import-time executable statements in shared public root modules and changed same-name facades.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { isChangedOwnerFacadeCandidate } from './verify-canonical-facades.helpers.mjs';
import {
  collectCodeFiles,
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
  repoRoot,
} from './shared.mjs';
import {
  createTypeScriptSourceFile,
  getNodeLine,
  toRootRelativePath,
} from './typescript-ast-helpers.mjs';
import { resolveScopedTargetFiles } from '../runtime/target-files.helpers.mjs';
import { collectPolicyEntryViolations } from './policy-entry-helpers.mjs';
import { isSharedOwnerRootIndex } from './root-side-effects.shared-indexes.mjs';

const POLICY_PATH = 'tooling/configs/qa/root-side-effects.data.json';

function readPolicy(rootDir = repoRoot, policyPath = POLICY_PATH) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, policyPath), 'utf8'));
}

function createViolation(file, line, expressionText) {
  return {
    rule: 'root-side-effects',
    file,
    line,
    message:
      `Root module executes import-time side effect "${expressionText}". ` +
      'Move registration/bootstrap logic into an explicit init/runtime owner.',
  };
}

function isCandidateRootFile(relativePath, root = repoRoot) {
  return isSharedOwnerRootIndex(relativePath) || isChangedOwnerFacadeCandidate(relativePath, root);
}

function resolveTargetFiles({ files = [], scope = 'workspace' } = {}) {
  return resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  }).files;
}

function isCallLikeExpression(expression) {
  if (
    ts.isCallExpression(expression) ||
    ts.isAwaitExpression(expression) ||
    ts.isNewExpression(expression)
  ) {
    return true;
  }

  if (
    ts.isVoidExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return isCallLikeExpression(expression.expression);
  }

  return false;
}

function getTopLevelExecutableExpression(statement) {
  if (ts.isExpressionStatement(statement) && isCallLikeExpression(statement.expression)) {
    return statement.expression;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer && isCallLikeExpression(declaration.initializer)) {
        return declaration.initializer;
      }
    }
  }

  if (ts.isExportAssignment(statement) && isCallLikeExpression(statement.expression)) {
    return statement.expression;
  }

  return null;
}

function collectTopLevelSideEffectViolations(filePath, rootDir, allowedRoots) {
  const relativePath = toRootRelativePath(rootDir, filePath);
  if (!isCandidateRootFile(relativePath, rootDir)) {
    return [];
  }
  if (allowedRoots.has(relativePath)) {
    return [];
  }

  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = createTypeScriptSourceFile(filePath, sourceText);
  const violations = [];

  for (const statement of sourceFile.statements) {
    const executableExpression = getTopLevelExecutableExpression(statement);
    if (!executableExpression) {
      continue;
    }

    const line = getNodeLine(sourceFile, statement);
    violations.push(
      createViolation(relativePath, line, executableExpression.getText(sourceFile).slice(0, 80))
    );
  }

  return violations;
}

function collectPolicyViolations(allowedRoots, policyPath, rootDir) {
  return collectPolicyEntryViolations(allowedRoots, {
    metadataRule: 'root-side-effects-policy-metadata',
    metadataMessage: (entry) =>
      `Root side-effect policy entry "${entry?.file ?? '<unknown>'}" is missing ` +
      'file/owner/justification/reviewNote metadata.',
    missingTargetRule: 'root-side-effects-policy-missing-target',
    missingTargetMessage: (entry) =>
      `Root side-effect policy entry "${entry.file}" points to a missing file. ` +
      'Update the allowlist to the real entry/init owner.',
    policyPath,
    requiredFields: ['file', 'owner', 'justification', 'reviewNote'],
    rootDir,
  });
}

export function collectRootSideEffectViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  const allowedRootEntries = policy.allowedRoots ?? [];
  const violations = collectPolicyViolations(allowedRootEntries, policyPath, rootDir);
  const allowedRoots = new Set(allowedRootEntries.map((entry) => entry.file));

  for (const filePath of files) {
    violations.push(...collectTopLevelSideEffectViolations(filePath, rootDir, allowedRoots));
  }

  return violations;
}

export function runRootSideEffectCheck({ files = [], scope = 'workspace' } = {}) {
  const targetFiles = resolveTargetFiles({ files, scope });
  const candidateFiles = targetFiles.filter((filePath) =>
    isCandidateRootFile(toRootRelativePath(repoRoot, filePath))
  );

  return {
    skipped: candidateFiles.length === 0,
    files: candidateFiles.map((filePath) => toRootRelativePath(repoRoot, filePath)),
    violations: collectRootSideEffectViolations(candidateFiles),
  };
}

export function runRepoWideRootSideEffectCheck() {
  return runRootSideEffectCheck({ scope: 'repo-wide' });
}

if (isExecutedAsScript(import.meta.url)) {
  const args = process.argv.slice(2);
  const repoWide = args.includes('--repo-wide');
  const reportOnly = args.includes('--report-only');
  const explicitFiles = parseFilesArgument(
    args.filter((arg) => arg !== '--repo-wide' && arg !== '--report-only')
  );
  const result = runRootSideEffectCheck({
    files: explicitFiles,
    scope: repoWide ? 'repo-wide' : 'workspace',
  });

  if (result.skipped) {
    process.stdout.write(
      repoWide
        ? 'Root side-effect repo report skipped: no matching root files\n'
        : 'Root side-effect check skipped: no changed root files\n'
    );
    process.exit(0);
  }

  if (result.violations.length > 0) {
    printViolations('Root side-effect violations found:', result.violations);
    process.exit(reportOnly ? 0 : 1);
  }

  process.stdout.write(
    repoWide ? 'Root side-effect repo report passed\n' : 'Root side-effect guardrail passed\n'
  );
}
