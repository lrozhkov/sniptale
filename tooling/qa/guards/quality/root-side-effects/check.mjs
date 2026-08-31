/**
 * Shared/public root side-effect owner.
 * Blocks import-time executable statements in shared public root modules and changed same-name facades.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { collectCodeFiles } from '../../../analysis/repository/shared-files.mjs';
import { repoRoot } from '../../../analysis/repository/shared-paths.mjs';
import {
  isExecutedAsScript,
  parseFilesArgument,
  printViolations,
} from '../../../runtime/process/shared-cli.mjs';
import {
  createTypeScriptSourceFile,
  getNodeLine,
  toRootRelativePath,
} from '../../../analysis/source/typescript-ast-helpers.mjs';
import { resolveScopedTargetFiles } from '../../../runtime/scope/target-files.helpers.mjs';
import { collectPolicyEntryViolations } from '../../../policy/shared/policy-entry-helpers.mjs';

const POLICY_PATH = 'tooling/configs/qa/root-side-effects.data.json';
const INDEX_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const SHARED_DOMAIN_OWNER_INDEX_PATHS = new Set([
  'apps/extension/src/features/editor/document/index.ts',
  'apps/extension/src/features/media-hub/index.ts',
  'apps/extension/src/features/prompt-templates/index.ts',
  'apps/extension/src/features/scenario/project/index.ts',
  'apps/extension/src/features/scenario/stage/index.ts',
  'apps/extension/src/features/video/composition/index.ts',
  'apps/extension/src/features/video/project/index.ts',
  'apps/extension/src/features/web-snapshot/index.ts',
]);
const SHARED_PERSISTENCE_OWNER_ROOTS = new Set([
  'db',
  'media-hub-backup',
  'scenario-store',
  'state-manager',
  'storage',
]);

function hasIndexFileName(relativePath) {
  const extension = path.posix.extname(relativePath);
  return (
    INDEX_EXTENSIONS.has(extension) && path.posix.basename(relativePath, extension) === 'index'
  );
}

function isSharedOwnerRootIndex(relativePath) {
  if (!hasIndexFileName(relativePath)) return false;
  const segments = relativePath.split('/');
  if (segments[0] === 'packages' && segments[2] === 'src') return true;
  if (SHARED_DOMAIN_OWNER_INDEX_PATHS.has(relativePath)) return true;
  if (segments.slice(0, 4).join('/') !== 'apps/extension/src/composition') return false;
  return (
    segments[4] === 'persistence' &&
    segments.length === 7 &&
    SHARED_PERSISTENCE_OWNER_ROOTS.has(segments[5])
  );
}

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

function isCandidateRootFile(relativePath) {
  return isSharedOwnerRootIndex(relativePath);
}

function resolveTargetFiles({ files = [], scope = 'workspace' } = {}) {
  return resolveScopedTargetFiles({
    files,
    scope,
    collectFiles: collectCodeFiles,
  }).files;
}

function unwrapExpression(expression) {
  if (
    ts.isAwaitExpression(expression) ||
    ts.isVoidExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function isFunctionBoundary(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function importedEffectOperation(node, importedBindings) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return null;
  return importedBindings.get(node.expression.text) ?? null;
}

function collectExecutableEffectNodes(node, importedBindings, standalone = false) {
  const current = unwrapExpression(node);
  if (
    ((ts.isCallExpression(current) ||
      ts.isNewExpression(current) ||
      ts.isTaggedTemplateExpression(current)) &&
      standalone) ||
    importedEffectOperation(current, importedBindings) !== null ||
    ts.isDeleteExpression(current) ||
    ts.isPostfixUnaryExpression(current) ||
    (ts.isPrefixUnaryExpression(current) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(current.operator)) ||
    (ts.isBinaryExpression(current) &&
      current.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      current.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
  ) {
    return [current];
  }
  if (isFunctionBoundary(current) || ts.isClassExpression(current)) return [];
  const effects = [];
  ts.forEachChild(current, (child) => {
    effects.push(...collectExecutableEffectNodes(child, importedBindings));
  });
  return effects;
}

function containsExecutableEffect(node, importedBindings) {
  return collectExecutableEffectNodes(node, importedBindings).length > 0;
}

function hasStaticModifier(member) {
  return member.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.StaticKeyword) === true;
}

function collectTopLevelEffectNodes(statement, importedBindings) {
  if (ts.isExpressionStatement(statement)) {
    return ts.isStringLiteral(statement.expression)
      ? []
      : collectExecutableEffectNodes(statement.expression, importedBindings, true);
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap(({ initializer }) =>
      initializer ? collectExecutableEffectNodes(initializer, importedBindings) : []
    );
  }
  if (ts.isExportAssignment(statement)) {
    return collectExecutableEffectNodes(statement.expression, importedBindings);
  }
  if (ts.isClassDeclaration(statement)) {
    return statement.members.flatMap((member) => {
      if (ts.isClassStaticBlockDeclaration(member)) return [member];
      if (
        ts.isPropertyDeclaration(member) &&
        hasStaticModifier(member) &&
        member.initializer &&
        containsExecutableEffect(member.initializer, importedBindings)
      ) {
        return collectExecutableEffectNodes(member.initializer, importedBindings);
      }
      return [];
    });
  }
  if (
    ts.isIfStatement(statement) ||
    ts.isSwitchStatement(statement) ||
    ts.isForStatement(statement) ||
    ts.isForInStatement(statement) ||
    ts.isForOfStatement(statement) ||
    ts.isWhileStatement(statement) ||
    ts.isDoStatement(statement) ||
    ts.isTryStatement(statement) ||
    ts.isThrowStatement(statement) ||
    ts.isWithStatement(statement) ||
    ts.isLabeledStatement(statement) ||
    ts.isBlock(statement)
  ) {
    return [statement];
  }
  return [];
}

function operationIdentity(expression, importedBindings) {
  const importedOperation = importedEffectOperation(expression, importedBindings);
  if (importedOperation !== null) return importedOperation;
  const current = unwrapExpression(expression);
  if (ts.isNewExpression(current)) {
    return `new:${current.expression.getText()}`;
  }
  if (!ts.isCallExpression(current)) return `syntax:${ts.SyntaxKind[current.kind]}`;
  const callee = current.expression;
  if (ts.isIdentifier(callee)) return `call:${callee.text}`;
  if (ts.isPropertyAccessExpression(callee)) {
    const owner = callee.expression;
    return ts.isIdentifier(owner)
      ? `call:${owner.text}.${callee.name.text}`
      : `call:${callee.name.text}`;
  }
  return `syntax:${ts.SyntaxKind[current.kind]}`;
}

function collectEffectfulImportBindings(sourceFile) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }
    for (const element of statement.importClause.namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (
        importedName !== 'createLazyDefaultOwner' &&
        !/^(?:initialize|install|register|start|subscribe)/u.test(importedName)
      ) {
        continue;
      }
      bindings.set(element.name.text, `import:${statement.moduleSpecifier.text}#${importedName}`);
    }
  }
  return bindings;
}

function collectTopLevelSideEffectViolations(filePath, rootDir, allowedOperations) {
  const relativePath = toRootRelativePath(rootDir, filePath);
  if (!isCandidateRootFile(relativePath)) {
    return [];
  }

  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = createTypeScriptSourceFile(filePath, sourceText);
  const importedBindings = collectEffectfulImportBindings(sourceFile);
  const violations = [];
  const allowed = allowedOperations.get(relativePath) ?? new Set();

  for (const statement of sourceFile.statements) {
    for (const executableExpression of collectTopLevelEffectNodes(statement, importedBindings)) {
      if (allowed.has(operationIdentity(executableExpression, importedBindings))) continue;
      const line = getNodeLine(sourceFile, executableExpression);
      violations.push(
        createViolation(relativePath, line, executableExpression.getText(sourceFile).slice(0, 80))
      );
    }
  }

  return violations;
}

function collectObservedOperations(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = createTypeScriptSourceFile(filePath, sourceText);
  const importedBindings = collectEffectfulImportBindings(sourceFile);
  return new Set(
    sourceFile.statements
      .flatMap((statement) => collectTopLevelEffectNodes(statement, importedBindings))
      .map((node) => operationIdentity(node, importedBindings))
  );
}

function isSortedUniqueOperations(operations) {
  return (
    Array.isArray(operations) &&
    operations.length > 0 &&
    operations.every((operation) => typeof operation === 'string' && operation.length > 0) &&
    operations.every(
      (operation, index) => index === 0 || operations[index - 1].localeCompare(operation) < 0
    )
  );
}

function collectPolicyViolations(entries, policyPath, rootDir) {
  const violations = collectPolicyEntryViolations(entries, {
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
  for (const entry of entries) {
    if (!isSortedUniqueOperations(entry?.allowedOperations)) {
      violations.push({
        rule: 'root-side-effects-policy-operations',
        file: policyPath,
        message:
          `Root side-effect policy entry "${entry?.file ?? '<unknown>'}" requires a sorted, ` +
          'unique, non-empty allowedOperations list.',
      });
      continue;
    }
    const absolutePath = path.join(rootDir, entry.file);
    if (!fs.existsSync(absolutePath)) continue;
    if (!isCandidateRootFile(entry.file)) {
      violations.push({
        rule: 'root-side-effects-policy-noncandidate',
        file: policyPath,
        message: `Root side-effect policy entry "${entry.file}" is not a current root candidate.`,
      });
      continue;
    }
    const observed = collectObservedOperations(absolutePath);
    for (const operation of entry.allowedOperations) {
      if (!observed.has(operation)) {
        violations.push({
          rule: 'root-side-effects-policy-stale-operation',
          file: policyPath,
          message: `Root side-effect policy entry "${entry.file}" no longer uses ${operation}.`,
        });
      }
    }
  }
  return violations;
}

export function collectRootSideEffectViolations(
  files,
  { policyPath = POLICY_PATH, rootDir = repoRoot } = {}
) {
  const policy = readPolicy(rootDir, policyPath);
  const allowedRootEntries = policy.allowedRoots ?? [];
  const violations = collectPolicyViolations(allowedRootEntries, policyPath, rootDir);
  const allowedOperations = new Map(
    allowedRootEntries.map((entry) => [entry.file, new Set(entry.allowedOperations ?? [])])
  );

  for (const filePath of files) {
    violations.push(...collectTopLevelSideEffectViolations(filePath, rootDir, allowedOperations));
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
